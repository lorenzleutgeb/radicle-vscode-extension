#! /bin/sh
set -eu

for PACKAGE_JSON in npm/*/package.json
do
	DIR="$(dirname "$PACKAGE_JSON")"
	MAIN="$(jq -r '.main' "$PACKAGE_JSON")"
	if [ ! -f "$MAIN" ]
	then
		printf "\x1b[30;43m WARN \x1b[0m %s does not exist, so not populating %s\n" "$MAIN" "$DIR"
		continue
	fi
	mv "$MAIN" "$DIR"
	printf "\x1b[37;42m INFO \x1b[0m %s → %s\n" "$MAIN" "$DIR"
done
