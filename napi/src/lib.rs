use std::path::Path;
use std::str::FromStr;

#[macro_use]
extern crate napi_derive;

use anyhow::{Context, Result};

use napi::{Env, JsUnknown};
use radicle::cob::Author;
use radicle::identity::{DocAt, RepoId};
use radicle::issue::cache::Issues;
use radicle::node::routing::Store;
use radicle::node::{AliasStore, Handle};

use radicle::patch::cache::Patches;
use radicle::patch::PatchId;
use radicle::profile::Home;
use radicle::storage::{ReadRepository, ReadStorage};
use radicle::Profile;
use serde_json::Value;

mod json;

mod project {
	use serde::Serialize;
	use serde_json::Value;

	use radicle::cob;
	use radicle::git::Oid;
	use radicle::identity::project::Project;
	use radicle::identity::{RepoId, Visibility};

	#[derive(Serialize)]
	#[serde(rename_all = "camelCase")]
	pub struct Info {
		#[serde(flatten)]
		pub payload: Project,
		pub delegates: Vec<Value>,
		pub threshold: usize,
		pub visibility: Visibility,
		pub head: Oid,
		pub patches: cob::patch::PatchCounts,
		pub issues: cob::issue::IssueCounts,
		pub id: RepoId,
		pub seeding: usize,
	}
}

#[derive(thiserror::Error, Debug)]
pub enum Error {
	#[error("patch not found")]
	PatchNotFound,
	#[error("{err}")]
	WithHint {
		err: anyhow::Error,
		hint: &'static str,
	},
}

pub trait RadicleContext {
	fn profile(&self) -> Result<Profile, anyhow::Error>;
	fn home(&self) -> Result<Home, std::io::Error>;
}

impl RadicleContext for Profile {
	fn profile(&self) -> Result<Profile, anyhow::Error> {
		Ok(self.clone())
	}

	fn home(&self) -> Result<Home, std::io::Error> {
		Ok(self.home.clone())
	}
}

pub struct DefaultContext;

impl RadicleContext for DefaultContext {
	fn home(&self) -> Result<Home, std::io::Error> {
		radicle::profile::home()
	}

	fn profile(&self) -> Result<Profile, anyhow::Error> {
		match Profile::load() {
			Ok(profile) => Ok(profile),
			Err(radicle::profile::Error::NotFound(path)) => Err(Error::WithHint {
				err: anyhow::anyhow!("Radicle profile not found in '{}'.", path.display()),
				hint: "To setup your radicle profile, run `rad auth`.",
			}
			.into()),
			Err(radicle::profile::Error::Config(e)) => Err(e.into()),
			Err(e) => Err(anyhow::anyhow!("Could not load radicle profile: {e}")),
		}
	}
}

#[napi]
pub fn nid() -> anyhow::Result<String> {
	Ok(radicle::Node::new(DefaultContext.profile()?.socket())
		.nid()?
		.to_string())
}

#[napi]
pub fn rid_at(path: String) -> anyhow::Result<String> {
	Ok(radicle::rad::at(Path::new(&path))
		.map(|(_, rid)| rid)
		.with_context(|| format!("{} is not a Radicle repository", path))?
		.to_string())
}

#[napi]
pub fn project(env: Env, rid: String) -> Result<JsUnknown> {
	let profile = DefaultContext.profile()?;
	let aliases = profile.aliases();
	let repo = profile
		.storage
		.repository(RepoId::from_urn(rid.as_str())?)?;

	let doc = repo.identity_doc()?;

	let (_, head) = repo.head()?;
	let DocAt { doc, .. } = doc;
	let id = repo.id();

	let payload = doc.project()?;
	let delegates = doc
		.delegates
		.into_iter()
		.map(|did| json::author(&Author::new(did), aliases.alias(did.as_key())))
		.collect::<Vec<_>>();
	let issues = profile.issues(&repo)?.counts()?;
	let patches = profile.patches(&repo)?.counts()?;
	let db = &profile.database()?;
	let seeding = db.count(&id).unwrap_or_default();

	let info = project::Info {
		payload,
		delegates,
		threshold: doc.threshold,
		visibility: doc.visibility,
		head,
		issues,
		patches,
		id,
		seeding,
	};

	Ok(env.to_js_value(&info)?)
}

#[napi]
pub fn projects(env: Env) -> Result<Vec<JsUnknown>> {
	let profile = DefaultContext.profile()?;
	let storage = &profile.storage;
	let db = &profile.database()?;
	let policies = profile.policies()?;

	let mut projects = storage
		.repositories()?
		.into_iter()
		.filter(|repo| repo.doc.visibility.is_public())
		.collect::<Vec<_>>();

	projects.sort_by_key(|p| p.rid);

	let infos = projects
		.into_iter()
		.filter_map(|info| {
			if !policies.is_seeding(&info.rid).unwrap_or_default() {
				return None;
			}
			let Ok(repo) = storage.repository(info.rid) else {
				return None;
			};
			let Ok((_, head)) = repo.head() else {
				return None;
			};
			let Ok(payload) = info.doc.project() else {
				return None;
			};
			let Ok(issues) = profile.issues(&repo) else {
				return None;
			};
			let Ok(issues) = issues.counts() else {
				return None;
			};
			let Ok(patches) = profile.patches(&repo) else {
				return None;
			};
			let Ok(patches) = patches.counts() else {
				return None;
			};
			let aliases = profile.aliases();
			let delegates = info
				.doc
				.delegates
				.into_iter()
				.map(|did| json::author(&Author::new(did), aliases.alias(did.as_key())))
				.collect::<Vec<_>>();
			let seeding = db.count(&info.rid).unwrap_or_default();

			Some(project::Info {
				payload,
				delegates,
				head,
				threshold: info.doc.threshold,
				visibility: info.doc.visibility,
				issues,
				patches,
				id: info.rid,
				seeding,
			})
		})
		.filter_map(|info| {
			let Ok(unknown) = env.to_js_value(&info) else {
				return None;
			};
			return Some(unknown);
		})
		.collect::<Vec<_>>();

	Ok::<_, anyhow::Error>(infos)
}

#[napi]
pub fn patches(rid: String) -> Result<Vec<Value>> {
	let profile = DefaultContext.profile()?;
	let aliases = profile.aliases();
	let repo = profile
		.storage
		.repository(RepoId::from_urn(rid.as_str())?)?;
	let mut patches = Vec::from_iter(profile.patches(&repo)?.list()?.filter_map(|result| {
		match result {
			Ok(x) => Some(x),
			Err(_) => {
				// TODO(lorenzleutgeb): Report error.
				None
			}
		}
	}));
	patches.sort_by(|(_, a), (_, b)| b.timestamp().cmp(&a.timestamp()));
	Ok(patches
		.iter()
		.map(|(id, patch)| json::patch(*id, patch.clone(), &repo, &aliases))
		.collect::<Vec<_>>())
}

#[napi]
pub fn patch(rid: String, patch_id: String) -> Result<Value> {
	let oid = PatchId::from_str(patch_id.as_str())?;
	let profile = DefaultContext.profile()?;
	let aliases = profile.aliases();
	let repo = profile
		.storage
		.repository(RepoId::from_urn(rid.as_str())?)?;

	let patches = profile.patches(&repo)?;
	let patch = patches.get(&oid)?.ok_or(Error::PatchNotFound)?;

	Ok(json::patch(oid.into(), patch, &repo, &aliases))
}
