# Method

This document says exactly what the tool reads, how it reads a catalog and a Gradle file, what each rule looks at and
cannot see, and how the report is built. The names used here are the defaults; docs/inputs.md says how the
configuration changes them. The tool reads the version catalogs and the Gradle files of a project on disk as text, and
fetches nothing. It is a review of the dependency setup, not a Gradle build and not a dependency resolution: a finding
points at a line worth a look, and a clean run says only that the project holds none of the problems below. It never
says what the latest version of a library is.

## What is read

The input is one project folder. It is listed with a list of folders of the tool's own, with no recursion
(src/walk.js), in the order of the names; every file whose name ends with .gradle or .gradle.kts is a Gradle file:
build.gradle and build.gradle.kts of every module, settings.gradle and settings.gradle.kts, and scripts such as the
convention plugins of build-logic written as *.gradle.kts. The folders build, .gradle and .git are counted and passed
over, because they hold output, caches and history and not the build as written; so is every path that matches an
exclude pattern (`exclude` of the configuration and `--exclude`). A symbolic link (or a junction on Windows) is counted
and never followed.

The catalogs are, in this order: gradle/libs.versions.toml when it is there, read as the catalog libs; the catalogs
the settings file at the top of the project creates under versionCatalogs from a file, with the name it gives them;
and the files named with `--catalog`, whose name is the file name before .versions.toml (deps.versions.toml is deps).
A catalog named twice in two ways is read once. A catalog the settings file reads from a path outside the project
folder is not read and is an `unreadable-file` finding; one it takes from a published artifact (from("group:name:1.0"))
is not fetched, and a note says so.

Each file is read once (src/files.js), decoded by its byte order mark: UTF-16 little or big endian with one, UTF-8 with
or without one. A file that holds a null byte, bytes that are not valid UTF-8, or more than 1 MB is an `unreadable-file`
finding and nothing in it is checked.

## How a catalog is read

The catalog is read by src/toml.js, a small TOML reader of the tool's own with no dependency, and then by
src/catalog.js. The reader takes the part of TOML 1.0 a catalog uses: comments, bare, quoted and dotted keys, tables,
inline tables on one line, arrays over several lines, basic and literal strings in one line or many, integers, floats
and booleans. It refuses an array of tables ([[x]]), a date or a time, a value that is not quoted where a version is
(a = 1.2.0), a key defined twice and a table defined twice, each with its line and column; such a catalog is an
`unreadable-file` finding. It keeps a list of open arrays and inline tables of its own, with no recursion.

The tables are read as the Gradle page on version catalogs describes them:

- `[versions]`: each key is a version, a string or a rich version (a table of strictly, require, prefer, reject and
  rejectAll).
- `[libraries]`: each alias is "group:name:version", "group:name", or a table with module = "group:name", or with group
  and name, and a version that is a string, a version.ref, or a rich version.
- `[bundles]`: each alias is a list of library aliases.
- `[plugins]`: each alias is "id:version" or a table with id and a version.
- `[metadata]` is read by Gradle for the format version and passed over; any other table is an
  `invalid-catalog-entry` finding.

The accessor of an alias is made as Gradle makes it: dashes, underscores and dots all separate its parts, so
androidx-core-ktx, androidx_core_ktx and "androidx.core.ktx" are all libs.androidx.core.ktx. A version.ref is followed
to its key; a rich version stands for its strictly, else its require, else its prefer, when two versions are compared.

## How a Gradle file is read

A Gradle file is read as text, by src/gradle.js. The tool does not run Gradle and does not parse Groovy or Kotlin; it
reads the file once, sets its comments (// and /* */) and its strings (in single, double or triple quotes) apart, and
then looks for a few forms by their shape. This is a heuristic. What it reads:

- a reference to a catalog: the name of a catalog followed by .name.name, such as libs.androidx.core.ktx,
  libs.bundles.room, libs.plugins.kotlin.android or libs.versions.compileSdk, outside strings and comments, not after
  a dot. The accessor is the longest start of the chain that is an accessor of the catalog, so
  libs.versions.compileSdk.get() is the version compileSdk and libs.androidx.core.asProvider() the library
  androidx-core;
- a dependency string: a string that reads as group:name, group:name:version, with a classifier or an @extension,
  that is the first argument of a dependency configuration: implementation, api, compileOnly, runtimeOnly,
  annotationProcessor, kapt, ksp, classpath, coreLibraryDesugaring, lintChecks and their forms for a source set or a
  variant (testImplementation, debugApi, kaptTest), with or without parentheses, also inside platform(),
  enforcedPlatform() and testFixtures(). A string that is not an argument of a configuration, such as a variable, is
  not a dependency;
- a plugin id: id("...") and id '...', kotlin("...") in a plugins block (read as org.jetbrains.kotlin....), apply
  plugin: '...' and apply(plugin = "...");
- the calls jcenter() and mavenLocal();
- in the settings file at the top of the project, the catalogs created under versionCatalogs with create("name") or a
  block name { ... } and from(files("path")).

## The rules

### `invalid-catalog-entry`

Reports an entry of a catalog that Gradle cannot read as written: a table that is not versions, libraries, bundles,
plugins or metadata; a library with no module and no group and name, with module and also group or name, or with a
group or a name that is not a coordinate; a library string with more than three parts or an empty version; a plugin
with no id; a version that is empty, not a string, or a table of keys that are not ref, strictly, require, prefer,
reject and rejectAll; a version.ref inside [versions]; a bundle that is not a list or that names an alias that is not a
library of the catalog; and two aliases that give the same accessor. It cannot see what Gradle would say about an alias
it reserves, such as one that starts with bundles.

### `missing-version-ref`

Reports a version.ref of a library or a plugin whose key is not in the [versions] table of the same catalog, at the
place of the ref. Gradle stops when it reads such a catalog, so this is an error.

### `dynamic-version`

Reports a version that lets Gradle pick a different version from one build to the next: one that ends with + (1.+, +),
one that starts with latest. (latest.release, latest.integration), and a range, a version that starts with [, ] or (,
ends with ], [ or ) and holds a comma ([1.0,2.0), ]1.0,2.0[). It reads the [versions] keys, the version of a library or
a plugin written in place, the strictly, require and prefer of a rich version, and the version of a dependency string.
A version.ref is reported once, at its key. reject lists versions that are never taken, so it is not read for this
rule. A version written with a variable ($kotlinVersion) is not read, -SNAPSHOT versions are not reported, and 1.0+beta
is a plain version. The tool's own choice: a range is reported as an error even when dependency locking pins it,
because the lock file is not read.

### `duplicate-library`

Reports a library whose group:name is the same as that of a library before it in the catalogs read, under another
alias, with the place of the first. The same module in two catalogs counts too.

### `version-conflict`

Gathers every declaration of a library with a version: the libraries of the catalogs, with a version.ref followed to
its key and a rich version read as its strictly, else require, else prefer, and the dependency strings of the Gradle
files. When one group:name has two different versions, each declaration after the first with a version that differs
from the first is reported, with the place of the first. Dynamic versions and versions written with a variable are left
out. The order is the catalogs first, in the order they are read, then the Gradle files in the order of their paths.
Which of the versions the build gets depends on dependency resolution, which the tool does not run.

### `deprecated-coordinate`

Reports a library of a catalog and a dependency string of a Gradle file whose group:name matches an entry of
`deprecatedLibraries` (com.android.support:*, com.android.support.*:* and android.arch.*:* by default), and a plugin of
a catalog and a plugin id of a Gradle file in `deprecatedPlugins` (kotlin-android-extensions and
org.jetbrains.kotlin.android.extensions by default), with what to use instead. A library declared in a catalog is
reported there once, not at every reference to it. A class or a package of the Support Library used in code is not
seen.

### `jcenter-repository`

Reports a call jcenter() in any Gradle file, outside comments and strings: in the settings file, in a buildscript or in
a repositories block of a module. It cannot see a repository added by an init script outside the project or by a
plugin.

### `unused-catalog-entry`

Reports a library, a bundle or a plugin of a catalog whose accessor appears in no Gradle file of the project, outside
comments and strings. A library counts as used when a bundle that holds it is used. It cannot see references from
Kotlin or Java code that is not a Gradle file, such as the convention plugins of build-logic written as classes that
read the catalog through the VersionCatalogsExtension, or from a project outside the folder given; set the rule to info
or off for such a build.

### `unused-version`

Reports a key of [versions] that no version.ref of the same catalog names and that no Gradle file reads as
libs.versions.key, such as compileSdk = libs.versions.compileSdk.get().toInt().

### `hard-coded-dependency`

Reports a dependency string with a version, such as implementation("com.squareup.okio:okio:3.9.0"), in a Gradle file:
its name and version are written in the build file instead of coming from the catalog. The message says when a catalog
already has the library and names its accessor, and says when the project has no catalog yet. A string with no version
(a library aligned by a BOM), the map notation (group: 'x', name: 'y', version: 'z'), project(...) and files(...) are
not reported.

### `version-next-to-bom`

For each entry of `boms` whose BOM is declared in the project (a library of a catalog or a dependency string with the
group:name of the BOM), reports a library of a catalog or a dependency string that matches the libraries of the entry
and none of its except patterns, declared with a version of its own; the version written there overrides the one the
BOM aligns. The defaults are the Compose BOM (the androidx.compose.* groups, not the Compose compiler), the Firebase
BoM (com.google.firebase, not its Gradle plugins) and the coroutines BOM. It cannot see whether the BOM is imported
as a platform in the module that uses the library, or which version the BOM holds.

### `maven-local-repository`

Reports a call mavenLocal() in any Gradle file, outside comments and strings, as a warning, because there are rare
uses of it while a library is developed next to the app.

### `kapt-processor`

Reports a dependency in kapt, or in a kapt configuration of a variant (kaptTest, kaptAndroidTest), on a processor of
`kspProcessors` (Room, Glide, Moshi codegen, Dagger and Hilt by default), as a string or through a catalog accessor.
It is a suggestion, at the info level: a module may need kapt for another processor, such as data binding. The summary
says whether a kapt plugin is applied.

### `unreadable-file`

Reports a catalog or a Gradle file that cannot be read (over 1 MB, binary, not valid UTF-8 or UTF-16 with its byte
order mark), a catalog that is not TOML the reader takes, and a catalog the settings file names from a file that is not
there or that is outside the project folder. Nothing in such a file is checked. This rule has no key and is always an
error, so a run never passes because a file could not be read.

### `scan-limit`

Reports a project past a limit of docs/limits.md: more files and folders than the listing reads, folders nested more
than 32 deep, more Gradle files, a catalog with more entries, or more catalogs named. The rest is not read, so the run
fails. This rule has no key and is always an error.

## The report

Every finding has its rule, its level, the file, the line and the column, what was found and what to change; with
`--explain`, also the rule, the points of the public pages it rests on and the tool's own choice. Findings are sorted by
level, then file, line, column and rule. A rule lists at most 500 findings; the rest are counted in a note and still
count for the result. The summary counts the libraries, bundles, plugins and versions of the catalogs, the unused
entries and versions, the dependencies declared through a catalog and those written with a version in a Gradle file,
the BOMs found in the project and whether kapt is applied; the table of Gradle files gives, for each file, its module
(":app" for app/build.gradle.kts, ":" for the top folder, "settings" for the settings file), its references to a
catalog, its dependency strings, those with a version, its plugins and its findings by level.

The run fails when a finding is at or above the fail-on level (`error` by default): exit code `1`; otherwise `0`. A
usage or input error gives `2` and no result.
