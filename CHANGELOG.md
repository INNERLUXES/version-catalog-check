# Changes

## 1.0.0

First release.

- Checks the dependency setup of an Android app or any other Gradle project that uses a version catalog, from its files
  alone: gradle/libs.versions.toml, the catalogs the settings file reads from files, the catalogs named with
  `--catalog`, and every *.gradle and *.gradle.kts file below the project folder, with build, .gradle and .git passed
  over and `--exclude` patterns left out. Fetches nothing, runs no Gradle, follows no symbolic link, reads no clock and
  never says what the latest version of a library is.
- A small TOML reader of its own with no dependency for the catalog: tables, inline tables, dotted keys, arrays over
  several lines and every string form, with the line and column of every key and value; it refuses arrays of tables,
  dates and a key or a table defined twice, and keeps a list of its own with no recursion and limits of depth, values
  and string length.
- Gradle files read as text, as a documented heuristic: comments and strings set apart, catalog references
  (libs.x.y, libs.bundles.x, libs.plugins.x, libs.versions.x) matched to their entries the way Gradle builds accessors,
  dependency strings in a dependency configuration, plugin ids, jcenter() and mavenLocal(), and the catalogs of
  versionCatalogs in the settings file.
- Thirteen rules in three levels: an entry Gradle cannot read (`invalid-catalog-entry`), a version.ref to a missing key
  (`missing-version-ref`), a dynamic or open version: +, latest.release, latest.integration and ranges
  (`dynamic-version`), a library under two aliases (`duplicate-library`), one library with two versions across the
  catalogs and the build files (`version-conflict`), a deprecated coordinate or plugin: the Support Library, android.arch
  and kotlin-android-extensions by default (`deprecated-coordinate`), jcenter() (`jcenter-repository`), a catalog entry
  no Gradle file uses (`unused-catalog-entry`), a version nothing uses (`unused-version`), a dependency written with its
  version in a build file (`hard-coded-dependency`), a version next to the BOM that aligns it: Compose, Firebase and
  coroutines by default (`version-next-to-bom`), mavenLocal() (`maven-local-repository`), and a kapt processor that also
  runs with KSP (`kapt-processor`); and two rules of input problems that cannot be lowered (`unreadable-file`,
  `scan-limit`).
- A summary of the libraries, bundles, plugins and versions of the catalogs, the unused entries, the dependencies
  through a catalog and those written with a version, the BOMs found and whether kapt is applied, and a table of every
  Gradle file with its module and its counts.
- A configuration file in strict JSON over documented defaults: the level of every rule, the BOMs and the libraries each
  aligns, the deprecated coordinates and plugins, the KSP processors, the paths left out, the minimum severity and the
  level that fails the run; a key the tool does not know is an error with its line and a suggestion, and a key named
  twice is refused.
- Reports as text, JSON, CSV with one row per finding (`--format csv`) and GitHub workflow commands (`--format github`)
  that show each finding as an annotation; every finding has its file, line and column; `--min-severity`, `--fail-on`,
  `--explain` with the rule, the sources and the tool's own choice, and `--print-defaults`. Exit code `0` when no
  finding is at or above the fail-on level, `1` when one is, `2` for a usage or input error, with no result.
- A review of the files, not a Gradle build and not a dependency resolution: every report says so.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
