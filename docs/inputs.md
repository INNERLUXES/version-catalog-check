# Inputs

## The project

```
version-catalog-check <project folder> [--catalog <file>]... [--exclude <pattern>]... [--config <file>]
```

Name one folder: the folder of the whole Gradle build, the one that holds settings.gradle or settings.gradle.kts and
the gradle folder with libs.versions.toml. Every file below it whose name ends with .gradle or .gradle.kts is read as a
Gradle file; the folders build, .gradle and .git are passed over, and so is every path that matches an exclude pattern.
A project that is a file, a symbolic link or missing stops the run with exit code `2`. Check two projects in two runs.

The paths in the report are relative to the folder you run the command in, with forward slashes on every system,
followed by the line.

## The catalogs

The catalogs read are:

1. `gradle/libs.versions.toml` under the project folder, when it is there, as the catalog `libs`; Gradle reads it with
   no setting.
2. The catalogs the settings file at the top of the project creates from a file, such as

   ```kotlin
   dependencyResolutionManagement {
       versionCatalogs {
           create("tools") {
               from(files("gradle/tools.versions.toml"))
           }
       }
   }
   ```

   with the name it gives them (`tools`). The Groovy form `tools { from(files('...')) }` is read too. A path is read
   relative to the project folder; a path outside it is not read and is an `unreadable-file` finding, and so is a file
   that is not there. A catalog taken from a published artifact (`from("com.example:catalog:1.0")`) is not fetched; a
   note says so, and a local copy can be named with `--catalog`.
3. Each file named with `--catalog <file>`, relative to the folder you run the command in, with the name of the file
   before `.versions.toml` (or `.toml`): `deps.versions.toml` is the catalog `deps`, used in build files as `deps.x`.
   It may be given up to 20 times. A file named that does not exist, or a folder, stops the run.

A catalog found in two of these ways is read once. When two catalogs have the same name, the accessors of the build
files are matched to the first, and a note says so.

## Exclude patterns

`--exclude <pattern>` and `exclude` of the configuration leave paths of the project out. A pattern is matched against
the path relative to the project folder, with forward slashes: `*` is any run of characters but a slash, `?` one
character but a slash, `**` any run of characters with slashes, and `**/` any run of folders, none included. A folder
is left out when the pattern matches its path or its path with a slash after it, so `legacy/**` leaves out the folder
legacy and all below it, and `**/samples/**` every folder named samples. A pattern may not be absolute, hold a backslash
or `..`, or be longer than 200 characters. The patterns of `--exclude` add to those of the configuration.

## The configuration file

The configuration is one JSON object, read by a strict reader of RFC 8259 (no comments, no trailing comma, no name
given twice). Every key is optional; without `--config` the defaults apply, and `--print-defaults` writes them out. A key
the tool does not know is an error with its line and a suggestion, and stops the run with exit code `2`.

```json
{
  "name": "Harborlight dependency review",
  "exclude": ["legacy/**"],
  "rules": { "kaptProcessor": "info", "unusedCatalogEntry": "error" },
  "boms": [
    { "bom": "androidx.compose:compose-bom", "libraries": ["androidx.compose.*:*"], "except": ["androidx.compose.compiler:*"] },
    { "bom": "com.squareup.okhttp3:okhttp-bom", "libraries": ["com.squareup.okhttp3:*"] }
  ],
  "deprecatedLibraries": [{ "match": "com.android.support:*", "use": "the AndroidX artifact" }],
  "deprecatedPlugins": [{ "id": "kotlin-android-extensions", "use": "view binding and kotlin-parcelize" }],
  "kspProcessors": ["androidx.room:room-compiler"],
  "minSeverity": "info",
  "failOn": "error"
}
```

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown in the report | none |
| `rules` | an object of rule keys to `info`, `warning`, `error` or `off` | below |
| `boms` | up to 100 entries: `bom`, the group:name of the BOM; `libraries`, the coordinate patterns of the libraries it aligns; `except`, patterns left out | Compose, Firebase and coroutines, below |
| `boms[].bom` | a coordinate group:name | |
| `boms[].libraries` | a list of coordinate patterns, not empty | |
| `boms[].except` | a list of coordinate patterns | none |
| `deprecatedLibraries` | up to 100 entries: `match`, a coordinate pattern; `use`, what to use instead, 1 to 300 characters | below |
| `deprecatedLibraries[].match` | a coordinate pattern | |
| `deprecatedLibraries[].use` | a text | |
| `deprecatedPlugins` | up to 100 entries: `id`, a plugin id; `use`, what to use instead | below |
| `deprecatedPlugins[].id` | a plugin id | |
| `deprecatedPlugins[].use` | a text | |
| `kspProcessors` | up to 100 coordinates group:name of annotation processors that run with KSP | below |
| `exclude` | up to 100 path patterns | none |
| `minSeverity` | the lowest level shown: `info`, `warning` or `error` | `info` |
| `failOn` | the lowest level that fails the run | `error` |

A coordinate pattern is group:name, where `*` in each part is any run of characters: `com.android.support:*` is every
artifact of that group, `androidx.compose.*:*` every artifact of a group that starts with androidx.compose., and
`com.google.firebase:*-gradle` every artifact of that group whose name ends with -gradle. No key takes a regular
expression.

A list replaces its default as a whole, and an empty list turns that part off: no BOM, no deprecated coordinate, no
processor. A name given twice in a list of texts is kept once. `--min-severity` and `--fail-on` on the command line win
over the configuration.

### The default BOMs

| BOM | Libraries | Except |
| --- | --- | --- |
| `androidx.compose:compose-bom` | `androidx.compose.*:*` | `androidx.compose.compiler:*` |
| `com.google.firebase:firebase-bom` | `com.google.firebase:*` | `com.google.firebase:*-gradle`, `com.google.firebase:perf-plugin` |
| `org.jetbrains.kotlinx:kotlinx-coroutines-bom` | `org.jetbrains.kotlinx:kotlinx-coroutines-*` | none |

The Compose compiler is versioned with Kotlin, not with the Compose BOM, and the Gradle plugins of Firebase
(firebase-crashlytics-gradle, perf-plugin) go on the classpath of the build, not in the BoM; so they are left out. The
BOM itself is never reported, whatever its version.

### The default deprecated coordinates and plugins

| Match or id | Use instead |
| --- | --- |
| `com.android.support:*` | the AndroidX artifact (androidx.*) that the AndroidX migration page lists for it |
| `com.android.support.*:*` | the same, for the groups such as com.android.support.constraint and com.android.support.test |
| `android.arch.*:*` | the androidx artifact that took its place, such as androidx.lifecycle or androidx.room |
| `kotlin-android-extensions` | view binding, and the kotlin-parcelize plugin for @Parcelize |
| `org.jetbrains.kotlin.android.extensions` | the same |

### The default KSP processors

`androidx.room:room-compiler`, `com.github.bumptech.glide:compiler`, `com.squareup.moshi:moshi-kotlin-codegen`,
`com.google.dagger:dagger-compiler` and `com.google.dagger:hilt-compiler`, after the Android page on moving from kapt
to KSP and the table of supported libraries of the KSP overview.

## The keys of rules

| Key | Rule | Default |
| --- | --- | --- |
| `rules.invalidCatalogEntry` | `invalid-catalog-entry` | error |
| `rules.missingVersionRef` | `missing-version-ref` | error |
| `rules.dynamicVersion` | `dynamic-version` | error |
| `rules.duplicateLibrary` | `duplicate-library` | error |
| `rules.versionConflict` | `version-conflict` | error |
| `rules.deprecatedCoordinate` | `deprecated-coordinate` | error |
| `rules.jcenterRepository` | `jcenter-repository` | error |
| `rules.unusedCatalogEntry` | `unused-catalog-entry` | warning |
| `rules.unusedVersion` | `unused-version` | warning |
| `rules.hardCodedDependency` | `hard-coded-dependency` | warning |
| `rules.versionNextToBom` | `version-next-to-bom` | warning |
| `rules.mavenLocalRepository` | `maven-local-repository` | warning |
| `rules.kaptProcessor` | `kapt-processor` | info |

`unreadable-file` and `scan-limit` have no key: they are always errors. Setting a rule to `off` leaves it out of the
findings and the counts, and a note names it.
