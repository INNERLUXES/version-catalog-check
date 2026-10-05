# Limits

The tool reads the version catalogs and the Gradle files of a project from disk, as text. It is a review of the
dependency setup, not a Gradle build and not a dependency resolution. It fetches nothing, runs nothing, connects to no
system and asks nobody anything, and it never says what the latest version of a library is. A finding points at a line
where a problem was found, and a run without findings says only that the project holds none of the problems of
docs/method.md. Every report ends with a sentence that says so.

## What it cannot see

- **What Gradle resolves.** The tool runs no Gradle, so it does not see the versions the build gets in the end: what a
  platform or a BOM picks, what conflict resolution chooses between two versions, what a transitive dependency brings,
  what a lock file pins or what a plugin adds. `version-conflict` reports two versions that are written, not the one
  that wins.
- **The network.** No version is looked up, so the tool does not say whether a version is old, whether a newer one
  exists, whether a library has a known vulnerability, or whether a dependency is still in JCenter or Maven Central.
  It reads no clock and no dates ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **Groovy and Kotlin as languages.** Gradle files are read as text by their shape
  ([decision 2](decisions/0002-read-gradle-files-as-text-and-the-catalog-with-a-small-toml-reader.md)). A dependency
  written through a variable (`val retrofit = "..."` then `implementation(retrofit)`), built with string templates,
  added in a loop, written in the map notation (`group: 'x', name: 'y', version: 'z'`), added with
  `add("implementation", ...)` or through `project.dependencies`, or declared in a function of buildSrc or build-logic
  that is not a Gradle file, is not seen. A plugin applied by a convention plugin written as a class is not seen.
- **References outside Gradle files.** A catalog entry used only from Kotlin or Java code (for example a convention
  plugin that reads the catalog through VersionCatalogsExtension) is reported as unused. Set `unused-catalog-entry` to
  info or off for such a build.
- **Settings beyond catalogs.** Of the settings file, only the catalogs of versionCatalogs and the repository calls
  are read; included builds, the plugin management block beyond its repositories, and catalogs built in code with
  library(...) calls are not.
- **Published catalogs.** A catalog the settings file takes from a published artifact is not fetched; name a local copy
  with `--catalog`.
- **What is outside the folder.** Files outside the project folder, init scripts, gradle.properties and the Gradle
  home are not read, and a catalog the settings file reads from outside the folder is reported, not read.
- **Code.** The tool does not read Kotlin or Java sources, so a class of the Support Library used in code, or a
  processor applied through an annotation without a kapt dependency, is not seen.
- **Whether a finding matters to you.** A version may differ from a BOM on purpose, a range may be pinned by a lock
  file, and mavenLocal() may be used while a library is developed. Set the level of a rule, or turn it off, in the
  configuration.

## The readers

- The TOML reader refuses an array of tables, a date or a time, a version that is not in quotes, a key or a table
  defined twice, an inline table over several lines, an escape TOML does not have and a control character in a string
  or a comment, each with its line and column.
- A file is read as UTF-8, with or without a byte order mark, or as UTF-16 with its byte order mark; UTF-16 with no mark,
  and any other encoding, is an `unreadable-file` finding.
- The JSON reader of the configuration is strict: no comments, no trailing comma, no name given twice.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, a file is an error finding, or the listing stops
with a `scan-limit` finding.

| What | Limit |
| --- | --- |
| a Gradle file or a catalog | 1 MB; a larger one is an `unreadable-file` finding |
| the configuration | 1 MB |
| files and folders of the project listed | 50,000 |
| folders nested | 32 deep |
| Gradle files | 5,000 |
| catalogs read | 20 |
| entries of a catalog (versions, libraries, bundles and plugins) | 5,000 |
| values of a catalog | 50,000, nested up to 16 deep, strings of up to 4,096 characters, keys of up to 16 parts |
| strings of a Gradle file read | 100,000 |
| catalog references of a Gradle file read | 100,000 |
| blocks of versionCatalogs read | 200 |
| a dependency string read as a coordinate | 300 characters |
| how far back a call is looked for from its argument | 4,096 characters |
| exclude patterns | 100, of up to 200 characters |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests check a catalog of four thousand libraries with a build file of four thousand references, TOML with runs of
hundreds of thousands of brackets, braces, quotes, escapes and dots, Gradle text with runs of hundreds of thousands of
quotes, comments, templates, references and braces, patterns of hundreds of wildcards, hundreds of modules and folders
nested past the limit, each with a time check.
