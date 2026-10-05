# version-catalog-check

Gradle version catalog check for Android and other Gradle projects. Give it the folder of the project. It reads
gradle/libs.versions.toml, the other catalogs the settings file names, and every build.gradle and build.gradle.kts as
text, fetches nothing, and lists what a team finds when it takes over or reviews the codebase: catalog entries and
versions no build file uses, a version.ref to a key that is not there, dependencies written with their version in a
build file instead of the catalog, dynamic versions (+, latest.release, ranges), a library declared twice or with two
versions, a version next to the BOM that aligns it, deprecated coordinates such as the Support Library, android.arch
and kotlin-android-extensions, jcenter() and mavenLocal(), and annotation processors on kapt that also run with KSP.
Each catalog and each Gradle file gets a summary with its counts. Every finding has its file, line and column and what
to change, and the run exits with a code a pipeline can act on.

**It is a review of the files, not a Gradle build and not a dependency resolution.** It runs no Gradle, never looks a
version up and never says what the latest version is; it reads what the catalog and the build files say, and a clean
run means only that none of the problems of its rules were found.

A catalog keeps the names and versions of dependencies in one file in place of each build file
(https://developer.android.com/build/migrate-to-catalogs), Gradle warns that dynamic versions make builds that cannot be
reproduced (https://docs.gradle.org/current/userguide/dependency_versions.html), and with the Compose BOM the Compose
libraries are declared with no version (https://developer.android.com/develop/ui/compose/bom). These mistakes build
without a word, and surface later as a version nobody chose, an entry nobody uses or a library two modules see in two
versions; each is visible in the catalog and the build files. This tool reads them on every change.

- **One check per problem.** Thirteen rules, each with what it looks at, what it cannot see, the public pages it rests
  on and what to change, and two rules of input problems that are always errors.
- **Accessors as Gradle builds them.** Dashes, underscores and dots of an alias all become dots, so
  libs.androidx.core.ktx is matched to androidx-core-ktx, and libs.versions.compileSdk to the version compileSdk.
- **A TOML reader of its own.** A small reader with no dependency for the part of TOML a catalog uses, with the line and
  column of every key and value, that refuses what it does not read.
- **Build files as text.** Comments and strings are set apart, so a dependency that is commented out is not reported;
  what the heuristic reads and misses is written down.
- Reports as text, JSON, CSV with one row per finding and GitHub workflow annotations, with an exit code for a
  pipeline: `0` no finding at or above the `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 123
pass 121
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link, a device or file permissions (links in the project to a file and to a folder, a project and a catalog
named through a link, the default catalog through a link, `/dev/null` named as a project, and a build file with no read
access); they are guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line.
`npm run test:coverage` runs the same tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/version-catalog-check.git
cd version-catalog-check
node bin/version-catalog-check.js examples/messy --config examples/config.json
```

Or without a clone, in the folder of your own project:

```
npx --yes github:INNERLUXES/version-catalog-check .
```

`examples/` holds two made-up projects. `examples/messy/` is a bike rental app whose build a new team is about to take
over: a catalog with a library and a version nobody uses, a version.ref to a missing key, the dynamic version `4.+`, and
`androidx.core:core-ktx` under two aliases with two versions; an app module that writes three dependencies with their
version, one from the Support Library, gives a Compose library a version next to the Compose BOM, and runs the Room
compiler with kapt; `jcenter()` in the settings and `mavenLocal()` in the core module. It also holds what must not be
reported: commented-out dependencies, libraries used through a bundle, a Compose library with no version, a version
read through `libs.versions`, a file under `build/` and a legacy module the configuration leaves out.
`examples/clean/` is a notes app whose build is in good order. The version of the Compose BOM, a date in real life, is
written in both as a stand-in number.

## Usage

```
version-catalog-check <project folder> [--catalog <file>]... [--exclude <pattern>]... [--config <file>] [options]
```

```
--catalog <file>          a catalog to read besides gradle/libs.versions.toml and those of the settings file; its
                          name is the file name before .versions.toml; may be given more than once
--exclude <pattern>       a path of the project to leave out, relative to it, such as legacy/** or **/samples/**;
                          may be given more than once, and adds to exclude of the configuration
--config <file>           settings in strict JSON: rules, boms, deprecatedLibraries, deprecatedPlugins,
                          kspProcessors, exclude, minSeverity and failOn (--print-defaults shows them)
--format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                          workflow commands that GitHub shows as annotations
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: minSeverity of
                          the configuration, else info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: failOn of
                          the configuration, else error)
--explain                 show the rule, the public sources and the tool's own choice behind each finding
--print-defaults          print the built-in configuration and exit
--help                    show the usage
--version                 show the version
```

Name one project folder, the one that holds settings.gradle or settings.gradle.kts. The paths in the report are
relative to the folder you run the command in, with forward slashes on every system, followed by the line.

The report of the messy example starts with what was read, the catalogs, the configuration, the rules and the findings
in one line each; then every catalog with its counts; then every Gradle file with its module, its references to the
catalog, its dependency strings, those with a version, its plugins and its findings; then the summary; then the count
of findings of every rule; then the findings, errors first, each with what to change:

```
version-catalog-check: examples/messy
input: 4 Gradle files (1 settings file); 1 catalog; 2 other files passed over; 1 folder named build, .gradle or .git passed over; 1 path excluded; 0 links not followed
catalogs: examples/messy/gradle/libs.versions.toml (libs)
config: examples/config.json (Harborlight dependency review): BOMs androidx.compose:compose-bom, com.google.firebase:firebase-bom and org.jetbrains.kotlinx:kotlinx-coroutines-bom; deprecated libraries com.android.support:*, com.android.support.*:* and android.arch.*:*; deprecated plugins kotlin-android-extensions and org.jetbrains.kotlin.android.extensions; KSP processors androidx.room:room-compiler, com.github.bumptech.glide:compiler, com.squareup.moshi:moshi-kotlin-codegen, com.google.dagger:dagger-compiler and com.google.dagger:hilt-compiler; exclude legacy/**; minimum severity info; fail on error
rules: invalid-catalog-entry (error); missing-version-ref (error); dynamic-version (error); duplicate-library (error); version-conflict (error); deprecated-coordinate (error); jcenter-repository (error); unused-catalog-entry (warning); unused-version (warning); hard-coded-dependency (warning); version-next-to-bom (warning); maven-local-repository (warning); kapt-processor (info); unreadable-file (error); scan-limit (error)
findings: 15 (6 error, 8 warning, 1 info)

Catalogs (1)

  catalog                                   name  versions  libraries  bundles  plugins  unused
  examples/messy/gradle/libs.versions.toml  libs  12        16         1        4        2

Gradle files (4)

  file                                 module    catalog  strings  with version  plugins  error  warning  info
  examples/messy/app/build.gradle.kts  :app      13       3        3             3        1      4        1
  examples/messy/build.gradle.kts      :         0        0        0             2        0      0        0
  examples/messy/core/build.gradle     :core     1        0        0             2        0      1        0
  examples/messy/settings.gradle.kts   settings  0        0        0             0        1      0        0

Summary

  catalog entries: 16 libraries, 1 bundle, 4 plugins, 12 versions
  unused: 1 catalog entry, 1 version
  dependencies: 14 through a catalog, 3 written with a version in a build file
  BOMs in the project: androidx.compose:compose-bom
  kapt: applied

Rules (15)

  rule                    level    findings
  invalid-catalog-entry   error    0
  missing-version-ref     error    1
  dynamic-version         error    1
  duplicate-library       error    1
  version-conflict        error    1
  deprecated-coordinate   error    1
  jcenter-repository      error    1
  unused-catalog-entry    warning  1
  unused-version          warning  1
  hard-coded-dependency   warning  3
  version-next-to-bom     warning  2
  maven-local-repository  warning  1
  kapt-processor          info     1
  unreadable-file         error    0
  scan-limit              error    0

Findings (15)

  ERROR    deprecated-coordinate   examples/messy/app/build.gradle.kts:36
           com.android.support:appcompat-v7 (the dependency "com.android.support:appcompat-v7:28.0.0" in implementation) matches com.android.support:*, which is deprecated; use the AndroidX artifact (androidx.*) that the AndroidX migration page lists for it; the Support Library is no longer maintained
           fix: move to the replacement the message names, and remove the old coordinate or plugin

  ERROR    dynamic-version         examples/messy/gradle/libs.versions.toml:11
           the version "okhttp" of the catalog libs is 4.+: the prefix version 4.+ takes the newest version that starts with 4. when the build runs, so two builds of the same commit can use different versions
           fix: write the one version the build should use, such as 4.12.0, and change it on purpose when you update; if a range is needed, lock the resolved versions with Gradle dependency locking

  ERROR    missing-version-ref     examples/messy/gradle/libs.versions.toml:28
           the library "glide" has version.ref = "glide", but [versions] has no key glide, so Gradle stops when it reads the catalog
           fix: add the key to [versions], or point version.ref at the key that holds the version

  ERROR    duplicate-library       examples/messy/gradle/libs.versions.toml:30
           the library "core-ktx" of the catalog libs has the coordinates androidx.core:core-ktx, as the library "androidx-core-ktx" of the catalog libs does (examples/messy/gradle/libs.versions.toml:18); a build file can use either alias
           fix: keep one alias for the library, point every build file at it, and remove the other

  ERROR    version-conflict        examples/messy/gradle/libs.versions.toml:30
           androidx.core:core-ktx has version 1.12.0 in the library "core-ktx" of the catalog libs, and version.ref "coreKtx" (1.13.1) in the library "androidx-core-ktx" of the catalog libs (examples/messy/gradle/libs.versions.toml:18); which one the build gets depends on resolution
           fix: declare the library once, in the catalog, with one version, and use the catalog accessor in every build file

  ERROR    jcenter-repository      examples/messy/settings.gradle.kts:14
           jcenter() is a repository of this build, and JCenter is read-only and takes no new versions; a dependency that is only there cannot be updated, and Gradle deprecates jcenter()
           fix: replace jcenter() with mavenCentral() and check that every dependency is found there

  WARNING  hard-coded-dependency   examples/messy/app/build.gradle.kts:31
           the dependency "androidx.compose.ui:ui-tooling-preview:1.6.8" in implementation is written with its version in the build file instead of coming from the catalog
           fix: add the library to the catalog and declare it through its accessor, such as implementation(libs.retrofit)

  WARNING  version-next-to-bom     examples/messy/app/build.gradle.kts:31
           the dependency "androidx.compose.ui:ui-tooling-preview:1.6.8" in implementation gives androidx.compose.ui:ui-tooling-preview version 1.6.8, while the BOM androidx.compose:compose-bom is declared in the project; a version written here overrides the one the BOM aligns
           fix: leave the version out and let the BOM choose it; if one library must differ on purpose, say why in a comment and set this rule to info

  WARNING  hard-coded-dependency   examples/messy/app/build.gradle.kts:34
           the dependency "com.squareup.retrofit2:converter-moshi:2.11.0" in implementation is written with its version in the build file instead of coming from the catalog
           fix: add the library to the catalog and declare it through its accessor, such as implementation(libs.retrofit)

  WARNING  hard-coded-dependency   examples/messy/app/build.gradle.kts:36
           the dependency "com.android.support:appcompat-v7:28.0.0" in implementation is written with its version in the build file instead of coming from the catalog
           fix: add the library to the catalog and declare it through its accessor, such as implementation(libs.retrofit)

  WARNING  maven-local-repository  examples/messy/core/build.gradle:7
           mavenLocal() is a repository of this build: the local Maven folder differs from machine to machine, can hold modules with parts missing, and Gradle does not cache it
           fix: remove mavenLocal(); to build against a local change of a library, use a composite build (includeBuild)

  WARNING  unused-version          examples/messy/gradle/libs.versions.toml:15
           the version "timber" of the catalog libs is never used: no version.ref names it and no Gradle file reads libs.versions.timber
           fix: remove the key, or point the library or plugin that should follow it at it with version.ref

  WARNING  version-next-to-bom     examples/messy/gradle/libs.versions.toml:22
           the library "compose-material3" of the catalog libs gives androidx.compose.material3:material3 version 1.2.1, while the BOM androidx.compose:compose-bom is declared in the project; a version written here overrides the one the BOM aligns
           fix: leave the version out and let the BOM choose it; if one library must differ on purpose, say why in a comment and set this rule to info

  WARNING  unused-catalog-entry    examples/messy/gradle/libs.versions.toml:29
           the library "picasso" (com.squareup.picasso:picasso) of the catalog libs is never used: no Gradle file names libs.picasso, and no bundle that is used holds it
           fix: remove the entry when nothing uses it, or reference it where it is meant to be used

  INFO     kapt-processor          examples/messy/app/build.gradle.kts:39
           androidx.room:room-compiler (libs.room.compiler) runs with kapt, and it also runs with KSP, which needs no Java stubs and is faster; kapt is in maintenance mode
           fix: apply the KSP plugin (com.google.devtools.ksp), change kapt(...) to ksp(...), and remove the kapt plugin once no processor needs it

note: 1 path matching legacy/** is left out
note: 1 folder named build, .gradle or .git is passed over

This check reads the version catalogs and the Gradle files on disk as text and fetches nothing; it never says what the latest version of a library is. A finding is a lead with a file and a line, and a clean result is not a Gradle build and not a dependency resolution (docs/limits.md).

RESULT: FAIL - 6 findings at or above error (6 error, 8 warning, 1 info)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and the tool's own
choice:

```
  ERROR    dynamic-version         examples/messy/gradle/libs.versions.toml:11
           the version "okhttp" of the catalog libs is 4.+: the prefix version 4.+ takes the newest version that starts with 4. when the build runs, so two builds of the same commit can use different versions
           fix: write the one version the build should use, such as 4.12.0, and change it on purpose when you update; if a range is needed, lock the resolved versions with Gradle dependency locking
           rule: a version written with +, latest.* or as a range
           basis: Gradle takes ranges such as [1.0,2.0), prefix versions such as 1.+, and the status versions latest.release and latest.integration (Declaring Versions and Ranges (Gradle User Manual), https://docs.gradle.org/current/userguide/dependency_versions.html)
           basis: dynamic versions and changing modules can make builds that cannot be reproduced, and a new version may break the API, so locking is advised when they are used (Declaring Versions and Ranges (Gradle User Manual), https://docs.gradle.org/current/userguide/dependency_versions.html)
           basis: strictly is the strongest constraint, require allows a higher version, prefer applies only when nothing stronger is given, and reject excludes versions (Declaring Versions and Ranges (Gradle User Manual), https://docs.gradle.org/current/userguide/dependency_versions.html)
           the tool's own choice: a version that ends with + (1.+, +), starts with latest. (latest.release, latest.integration), or is a range such as [1.0,2.0) or ]1.0,2.0[, in [versions], in a library or plugin of a catalog, in a strictly, require or prefer of a rich version, or in a dependency string of a build file; a version.ref is reported once, at its key; reject is not read for this rule; -SNAPSHOT versions are not reported
```

The clean example passes:

```
version-catalog-check: examples/clean
input: 3 Gradle files (1 settings file); 1 catalog; 2 other files passed over; 0 folders named build, .gradle or .git passed over; 0 paths excluded; 0 links not followed
catalogs: examples/clean/gradle/libs.versions.toml (libs)
config: built-in defaults: BOMs androidx.compose:compose-bom, com.google.firebase:firebase-bom and org.jetbrains.kotlinx:kotlinx-coroutines-bom; deprecated libraries com.android.support:*, com.android.support.*:* and android.arch.*:*; deprecated plugins kotlin-android-extensions and org.jetbrains.kotlin.android.extensions; KSP processors androidx.room:room-compiler, com.github.bumptech.glide:compiler, com.squareup.moshi:moshi-kotlin-codegen, com.google.dagger:dagger-compiler and com.google.dagger:hilt-compiler; exclude none; minimum severity info; fail on error
rules: invalid-catalog-entry (error); missing-version-ref (error); dynamic-version (error); duplicate-library (error); version-conflict (error); deprecated-coordinate (error); jcenter-repository (error); unused-catalog-entry (warning); unused-version (warning); hard-coded-dependency (warning); version-next-to-bom (warning); maven-local-repository (warning); kapt-processor (info); unreadable-file (error); scan-limit (error)
findings: 0

Catalogs (1)

  catalog                                   name  versions  libraries  bundles  plugins  unused
  examples/clean/gradle/libs.versions.toml  libs  9         8          1        4        0

Gradle files (3)

  file                                 module    catalog  strings  with version  plugins  error  warning  info
  examples/clean/app/build.gradle.kts  :app      7        0        0             4        0      0        0
  examples/clean/build.gradle.kts      :         0        0        0             4        0      0        0
  examples/clean/settings.gradle.kts   settings  0        0        0             0        0      0        0

Summary

  catalog entries: 8 libraries, 1 bundle, 4 plugins, 9 versions
  unused: 0 catalog entries, 0 versions
  dependencies: 7 through a catalog, 0 written with a version in a build file
  BOMs in the project: androidx.compose:compose-bom
  kapt: not applied

Rules (15)

  rule                    level    findings
  invalid-catalog-entry   error    0
  missing-version-ref     error    0
  dynamic-version         error    0
  duplicate-library       error    0
  version-conflict        error    0
  deprecated-coordinate   error    0
  jcenter-repository      error    0
  unused-catalog-entry    warning  0
  unused-version          warning  0
  hard-coded-dependency   warning  0
  version-next-to-bom     warning  0
  maven-local-repository  warning  0
  kapt-processor          info     0
  unreadable-file         error    0
  scan-limit              error    0

Findings (0)

  none

This check reads the version catalogs and the Gradle files on disk as text and fetches nothing; it never says what the latest version of a library is. A finding is a lead with a file and a line, and a clean result is not a Gradle build and not a dependency resolution (docs/limits.md).

RESULT: PASS - no finding at or above error
```

## How the files are read

1. The project folder is listed with a list of folders of its own and no link followed; every file ending with .gradle or
   .gradle.kts is a Gradle file, and the folders build, .gradle and .git and the paths of `--exclude` are passed over.
2. The catalogs are gradle/libs.versions.toml (as `libs`), the catalogs the settings file creates under
   versionCatalogs from a file, and those named with `--catalog`. Each is read by a small TOML reader of the tool's own,
   then as the tables versions, libraries, bundles and plugins.
3. Each Gradle file is read as text: comments and strings are set apart, then catalog references, dependency strings in
   a dependency configuration, plugin ids, jcenter() and mavenLocal() are found by their shape.
4. The checks put the two side by side: a reference marks an entry used, and every declaration with a version is
   compared with the others and with the BOMs of the configuration.

[docs/method.md](docs/method.md) gives the details, and
[decision 2](docs/decisions/0002-read-gradle-files-as-text-and-the-catalog-with-a-small-toml-reader.md) says why the
build files are read as text and the catalog with a reader of the tool's own.

## What it reports

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `invalid-catalog-entry` | `rules.invalidCatalogEntry` | error | a catalog entry Gradle cannot read: an unknown table, a library with no module, a bad version, a bundle member that is not a library, two aliases with one accessor |
| `missing-version-ref` | `rules.missingVersionRef` | error | a version.ref to a key that is not in [versions] |
| `dynamic-version` | `rules.dynamicVersion` | error | a version with +, latest.release, latest.integration or a range, in the catalog or a build file |
| `duplicate-library` | `rules.duplicateLibrary` | error | the same group:name under two aliases of the catalogs |
| `version-conflict` | `rules.versionConflict` | error | one group:name with two different versions across the catalogs and the build files |
| `deprecated-coordinate` | `rules.deprecatedCoordinate` | error | a library matching `deprecatedLibraries` or a plugin in `deprecatedPlugins` |
| `jcenter-repository` | `rules.jcenterRepository` | error | jcenter() in a settings or build file |
| `unused-catalog-entry` | `rules.unusedCatalogEntry` | warning | a library, bundle or plugin no Gradle file references |
| `unused-version` | `rules.unusedVersion` | warning | a key of [versions] no version.ref and no libs.versions reads |
| `hard-coded-dependency` | `rules.hardCodedDependency` | warning | a dependency string with a version in a build file, instead of the catalog |
| `version-next-to-bom` | `rules.versionNextToBom` | warning | a library a BOM of the project aligns, declared with a version of its own |
| `maven-local-repository` | `rules.mavenLocalRepository` | warning | mavenLocal() in a settings or build file |
| `kapt-processor` | `rules.kaptProcessor` | info | a kapt dependency on a processor that also runs with KSP |
| `unreadable-file` | none | error | a catalog or Gradle file that cannot be read, or a catalog of the settings file that is missing or outside the project |
| `scan-limit` | none | error | input past the limits of a run |

The two rules of input problems are always errors. [docs/method.md](docs/method.md) says exactly what each rule looks
at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public
pages each rule rests on.

## Catalogs and excluded paths

| Input | What is read |
| --- | --- |
| `gradle/libs.versions.toml` | read as the catalog `libs` when it is there, as Gradle does with no setting |
| the settings file | the catalogs of `versionCatalogs { create("name") { from(files("path")) } }`, in Kotlin or Groovy, relative to the project folder; a path outside it is reported and not read, and a catalog from a published artifact is not fetched |
| `--catalog <file>` | another catalog, named by its file name before `.versions.toml`: `deps.versions.toml` is `deps` |
| `--exclude <pattern>` and `exclude` | paths left out, matched relative to the project folder: `*` and `?` stay in one folder, `**` crosses folders, so `legacy/**` leaves the folder legacy out |

The folders build, .gradle and .git are never read. [docs/inputs.md](docs/inputs.md) describes every input.

## What is not checked

The tool reads the files it is given and never guesses. It does not:

- run Gradle, so it does not see the versions the build resolves in the end, what a BOM or a platform picks, what a
  transitive dependency brings or what a lock file pins;
- look a version up, so it does not say whether a version is old, whether a newer one exists or whether it has a known
  vulnerability;
- parse Groovy or Kotlin, so a dependency built from a variable, a loop or a function, or declared in the map notation,
  is not seen, and an entry used only from Kotlin code outside Gradle files is reported as unused;
- read Kotlin or Java sources, so a class of the Support Library used in code is not seen;
- read a date or the clock;
- decide whether the dependencies are safe: it is not a Gradle build and not a dependency resolution.

So a clean run means the project holds none of the problems the rules look for, and every report says so.

## The configuration file

```json
{
  "name": "Harborlight dependency review",
  "exclude": ["legacy/**"],
  "rules": {
    "kaptProcessor": "info"
  }
}
```

Every key is optional, and without `--config` the defaults apply. `rules` sets the level of each rule (`info`,
`warning`, `error` or `off`); `boms` lists the BOMs with the coordinate patterns of the libraries each aligns:
`androidx.compose:compose-bom` for `androidx.compose.*:*` but not the Compose compiler,
`com.google.firebase:firebase-bom` for `com.google.firebase:*` but not its Gradle plugins, and
`org.jetbrains.kotlinx:kotlinx-coroutines-bom` for `org.jetbrains.kotlinx:kotlinx-coroutines-*` by default;
`deprecatedLibraries` lists coordinate patterns with what to use instead, `com.android.support:*`,
`com.android.support.*:*` and `android.arch.*:*` by default; `deprecatedPlugins` lists plugin ids,
`kotlin-android-extensions` and `org.jetbrains.kotlin.android.extensions` by default; `kspProcessors` lists the
processors that run with KSP, `androidx.room:room-compiler`, `com.github.bumptech.glide:compiler`,
`com.squareup.moshi:moshi-kotlin-codegen`, `com.google.dagger:dagger-compiler` and `com.google.dagger:hilt-compiler` by
default; `exclude` lists paths to leave out; `minSeverity` sets the lowest level shown and `failOn` the lowest level that
fails the run. A key the tool does not know is an error with its line and a suggestion, and a key named twice is
refused. [docs/inputs.md](docs/inputs.md) describes every key and why each default was chosen, and `--print-defaults`
writes the whole default configuration out.

## Formats

- `text`: for a terminal: what was read, the catalogs, the configuration, the rules, the catalogs with their counts,
  the Gradle files with their module and counts, the summary, the count of every rule, the findings with the file and
  line and what to change, the notes, the notice and the result. With `--explain` also the rule, the points of the
  public pages and the tool's own choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the catalogs, the Gradle files, the summary,
  the counts per rule, every finding with its file, line and column, the totals, the result, the notes and the notice.
- `csv`: one record per finding, ready for a sheet: the level, the rule, the file, the line, the column, what was found
  and what to change, with CRLF line ends as RFC 4180 writes. A field that a spreadsheet could read as a formula gets a
  single quote in front. The start of the messy example:

```
level,rule,file,line,column,found,fix
error,deprecated-coordinate,examples/messy/app/build.gradle.kts,36,20,"com.android.support:appcompat-v7 (the dependency ""com.android.support:appcompat-v7:28.0.0"" in implementation) matches com.android.support:*, which is deprecated; use the AndroidX artifact (androidx.*) that the AndroidX migration page lists for it; the Support Library is no longer maintained","move to the replacement the message names, and remove the old coordinate or plugin"
error,dynamic-version,examples/messy/gradle/libs.versions.toml,11,10,"the version ""okhttp"" of the catalog libs is 4.+: the prefix version 4.+ takes the newest version that starts with 4. when the build runs, so two builds of the same commit can use different versions","write the one version the build should use, such as 4.12.0, and change it on purpose when you update; if a range is needed, lock the resolved versions with Gradle dependency locking"
error,missing-version-ref,examples/messy/gradle/libs.versions.toml,28,69,"the library ""glide"" has version.ref = ""glide"", but [versions] has no key glide, so Gradle stops when it reads the catalog","add the key to [versions], or point version.ref at the key that holds the version"
```

- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` (for info) with the file, line and
  column, which GitHub shows as an annotation in the pull request, then a summary line. The characters a command gives
  a meaning to are escaped. Two findings of the messy example:

```
::error file=examples/messy/gradle/libs.versions.toml,line=28,col=69,title=version-catalog-check missing-version-ref::the library "glide" has version.ref = "glide", but [versions] has no key glide, so Gradle stops when it reads the catalog; fix: add the key to [versions], or point version.ref at the key that holds the version
::warning file=examples/messy/app/build.gradle.kts,line=34,col=20,title=version-catalog-check hard-coded-dependency::the dependency "com.squareup.retrofit2:converter-moshi:2.11.0" in implementation is written with its version in the build file instead of coming from the catalog; fix: add the library to the catalog and declare it through its accessor, such as implementation(libs.retrofit)
```

## Exit codes

`0`: no finding at or above the fail-on level (`error` by default). `1`: at least one finding at or above it; with the
default, a catalog entry Gradle cannot read, a version.ref to a missing key, a dynamic version, a library declared
twice or with two versions, a deprecated coordinate or plugin, jcenter(), or a file the tool could not read; with
`--fail-on warning`, unused entries and versions, hard-coded dependencies, a version next to a BOM and mavenLocal()
too. `2`: a usage or input error: no project named, two projects named, an unknown option, an option given twice,
`--explain` with the csv or github format, a URL in place of a path, a project that is a file or is missing, a
symbolic link, a `--catalog` that is missing, a folder or named twice, an `--exclude` pattern that is not valid, or a
configuration with an unknown key, a key named twice or a value of the wrong kind. With exit code `2` the tool gives no
result and prints the problems on standard error.

## Limits

The tool reads files; it fetches nothing and connects to nothing. A run reports the problems of docs/method.md that the
project holds. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 1 MB for a Gradle file
or a catalog, 50,000 files and folders listed, folders nested up to 32 deep, 5,000 Gradle files, 20 catalogs, 5,000
entries of a catalog, 500 findings listed per rule. [docs/threat-model.md](docs/threat-model.md) lists the risks of
reading build files from a pull request and their controls, and [docs/secure-defaults.md](docs/secure-defaults.md) the
defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration, lists the project, finds and reads the catalogs and the Gradle files, and builds the report of the run |
| `src/walk.js`, `src/files.js` | the listing of the project with no link followed, and the bounded reading of files by their byte order mark |
| `src/toml.js`, `src/catalog.js` | the TOML reader, and the catalog read from its tables with its accessors |
| `src/gradle.js` | the Gradle files read as text: comments and strings set apart, references, dependency strings, plugins, repositories and the catalogs of the settings file |
| `src/project.js` | the checks of the project and its summary |
| `src/versions.js`, `src/glob.js` | dynamic and rich versions, and the path and coordinate patterns |
| `src/config.js`, `src/defaults.js`, `src/json.js` | the configuration file over the defaults, read as strict JSON |
| `src/rules.js` | the rules, their levels and the result |
| `src/report.js`, `src/csv.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON, CSV and GitHub output, the cleaning of text from the input, number formats and compared words |
| `src/data.js` | the public pages and the points the rules rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| The tables of a catalog, aliases and accessors, version.ref and rich versions, catalogs of the settings file | Gradle User Manual, https://docs.gradle.org/current/userguide/version_catalogs.html |
| Platforms and BOMs, and that a catalog does not take part in resolution | Gradle User Manual, https://docs.gradle.org/current/userguide/platforms.html |
| Ranges, prefix versions, latest.release, rich versions, and that dynamic versions cannot be reproduced | Gradle User Manual, https://docs.gradle.org/current/userguide/dependency_versions.html |
| Declaring repositories | Gradle User Manual, https://docs.gradle.org/current/userguide/declaring_repositories.html |
| Why mavenLocal() should not be added to a build | Gradle User Manual, https://docs.gradle.org/current/userguide/supported_repository_types.html |
| JCenter is read-only, and jcenter() is deprecated | Gradle blog, https://blog.gradle.org/jcenter-shutdown |
| Moving an Android build to a catalog, and naming aliases | Android Developers, https://developer.android.com/build/migrate-to-catalogs |
| The Compose BOM, and Compose libraries with no version | Android Developers, https://developer.android.com/develop/ui/compose/bom |
| The Firebase Android BoM | Firebase, https://firebase.google.com/docs/android/learn-more |
| The coroutines BOM | Kotlin on GitHub, https://github.com/Kotlin/kotlinx.coroutines |
| The Support Library is no longer maintained | Android Developers, https://developer.android.com/jetpack/androidx |
| The Support Library and android.arch moved to AndroidX | Android Developers, https://developer.android.com/jetpack/androidx/migrate |
| kotlin-android-extensions is deprecated | Android Developers, https://developer.android.com/topic/libraries/view-binding/migration |
| kapt is in maintenance mode, and moving to KSP | Android Developers, https://developer.android.com/build/migrate-to-ksp |
| The libraries that support KSP | Kotlin documentation, https://kotlinlang.org/docs/ksp-overview.html |
| The TOML format | TOML v1.0.0, https://toml.io/en/v1.0.0 |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object, and UTF-8 | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Formulas hidden in CSV files | OWASP, https://community.owasp.org/attacks/CSV_Injection |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

An Android codebase that changes hands carries its dependency setup with it: a catalog that grew over time, build files
that still write some versions by hand, a repository that no longer takes packages. None of it stops the build, so it
stays until someone reads the catalog and the build files side by side, which is the first review a team does when it
takes over an app or brings in new developers for it. How teams for such work are put together is described on the page
[Hire Android Developers](https://innerluxes.dev/application/mobile/development/android/developers-for-hire).

## License

MIT
