# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which parts of the tool lean on it. Nothing here is a copy of a page: read the page itself for its exact
wording. src/data.js holds the pages and the points the reports show, and test/data.test.js checks that every page in
src/data.js is listed here.
Each page was fetched and read before it was listed.

The tool reads the version catalogs and the Gradle files on disk as text; a clean result is not a Gradle build and not
a dependency resolution, and the tool never says what the latest version of a library is. These notes say what the
pages say so a reader can follow a finding back to its source; they are not advice on how to build any one app. The
pages were chosen with web addresses that hold no number that reads like a year, and the notes name no release by its
date.

## Gradle

### Version Catalogs (Gradle User Manual)

https://docs.gradle.org/current/userguide/version_catalogs.html

The page on version catalogs. A catalog file in TOML has four tables: versions, libraries, bundles and plugins. A
library is written as one string group:name:version, with module, or with group and name, and its version is a string,
a version.ref that names a key of the versions table, or a rich version. Dashes and underscores in an alias become dots
in the accessor, so ktor-client-core is used as libs.ktor.client.core. Gradle reads gradle/libs.versions.toml as the
catalog libs with no setting, and more catalogs are created in the settings file under versionCatalogs, each by name
from a file. A version in the catalog may be rich, with require, strictly, prefer, reject and rejectAll. The TOML reader
and src/catalog.js follow this page, and `invalid-catalog-entry`, `missing-version-ref`, `unused-catalog-entry` and
`unused-version` lean on it.

### Platforms (Gradle User Manual)

https://docs.gradle.org/current/userguide/platforms.html

A platform aligns the versions of a set of modules and is often published as a Maven BOM. Once it is imported with
platform(), the modules of the set can be declared with no version, and the platform takes part in dependency
resolution. The page also says that a catalog only names coordinates and versions and does not take part in
resolution. `version-next-to-bom` leans on it, and the limits say why the tool cannot tell which version resolution
picks.

### Declaring Versions and Ranges (Gradle User Manual)

https://docs.gradle.org/current/userguide/dependency_versions.html

The forms of a version: an exact version, a Maven range such as [1.0,2.0) or [1.1, 2.0), a prefix version such as 1.+,
the status versions latest.release and latest.integration, and snapshot versions. Rich versions order their strength:
strictly is the strongest, require allows a higher version, prefer applies only when nothing stronger is given, and
reject excludes versions. The page warns that dynamic versions and changing modules can make builds that cannot be
reproduced and may bring a new API, and advises dependency locking when they are used. `dynamic-version` and
`version-conflict` lean on it.

### Declaring Repositories (Gradle User Manual)

https://docs.gradle.org/current/userguide/declaring_repositories.html

Repositories are declared in a repositories block, and Gradle looks for each dependency in them; the page shows Maven
Central, Google and the local Maven repository. `jcenter-repository` and `maven-local-repository` read the calls that
declare repositories.

### Supported Repository Types (Gradle User Manual)

https://docs.gradle.org/current/userguide/supported_repository_types.html

The kinds of repositories Gradle reads. On the local Maven repository the page is plain: as a rule, do not add
mavenLocal() to a build. Maven treats the folder as a cache, so it can hold modules with parts missing; its files can be
overwritten, which is a risk for security, correctness and reproducible builds; and Gradle does not cache it, which
makes builds slower. A composite build is the advised way to build against a local change. `maven-local-repository`
leans on it.

### JCenter shutdown impact on Gradle builds (Gradle blog)

https://blog.gradle.org/jcenter-shutdown

The Gradle notice on the end of Bintray and JCenter. JCenter takes no new packages and is kept read-only, so a library
published only there gets no new version. Gradle advises moving builds to Maven Central, removed JCenter from its
templates and samples, and deprecates jcenter() for removal in a later major release. `jcenter-repository` leans on it.

## Android, Firebase and Kotlin

### Migrate your build to version catalogs (Android Developers)

https://developer.android.com/build/migrate-to-catalogs

How an Android project moves to a catalog: create gradle/libs.versions.toml with the versions, libraries and plugins
tables, name aliases in kebab case such as androidx-ktx for the best code completion, declare dependencies with
implementation(libs...) and plugins with alias(libs.plugins...). The point of the page is to keep names and versions
in one file in place of writing them in each build file. `hard-coded-dependency`, `duplicate-library`,
`version-conflict` and `unused-catalog-entry` lean on it.

### Use a Bill of Materials (Jetpack Compose, Android Developers)

https://developer.android.com/develop/ui/compose/bom

The Compose BOM, androidx.compose:compose-bom, lists versions of the Compose libraries that work together. With the BOM
imported as a platform, the Compose libraries are declared with no version; a version written on one library overrides
the BOM for it. In a catalog, the BOM gets a version and the Compose libraries are written with group and name only.
The versions of the BOM itself are dates; the examples of this repository write a stand-in number in their place.
`version-next-to-bom` and its default entry for Compose lean on it.

### Learn more about Android and Firebase: the Firebase Android BoM (Firebase)

https://firebase.google.com/docs/android/learn-more

The Firebase Android BoM, com.google.firebase:firebase-bom, lets an app declare the Firebase libraries with no version,
and keeps them compatible with each other. A library can be given a version that differs from the BoM, but the page
advises against it when more than one Firebase library is used. The BoM does not add libraries by itself; each is still
declared. The default entry for Firebase in `boms` leans on it; the Gradle plugins of Firebase are not part of the BoM,
so the default leaves them out.

### kotlinx.coroutines (Kotlin on GitHub)

https://github.com/Kotlin/kotlinx.coroutines

The repository of the coroutines library. It holds the module kotlinx-coroutines-bom next to the libraries such as
kotlinx-coroutines-core and kotlinx-coroutines-android. The default entry for coroutines in `boms` leans on it.

### AndroidX overview (Android Developers)

https://developer.android.com/jetpack/androidx

AndroidX took the place of the Android Support Library, which is no longer maintained: 28.0.0 was its last release, all
new work is in the androidx packages, and those are versioned on their own. `deprecated-coordinate` and its default
entries for com.android.support lean on it.

### Migrate to AndroidX (Android Developers)

https://developer.android.com/jetpack/androidx/migrate

How a project moves from the Support Library to AndroidX: the com.android.support artifacts and the android.arch
packages moved to androidx, only package and artifact names changed, and the page links the mapping of every artifact.
The default entries of `deprecatedLibraries` lean on it, and the message names the mapping as the place to look.

### Migrate from Kotlin synthetics to Jetpack view binding (Android Developers)

https://developer.android.com/topic/libraries/view-binding/migration

Kotlin Android Extensions is deprecated: the kotlin-android-extensions plugin is removed and view binding takes its
place, with the kotlin-parcelize plugin for the Parcelable support the old plugin had. The default entries of
`deprecatedPlugins` lean on it.

### Migrate from kapt to KSP (Android Developers)

https://developer.android.com/build/migrate-to-ksp

kapt runs Java annotation processors on Kotlin code by making Java stubs first, which is slow; KSP reads Kotlin
directly and can make builds up to twice as fast. kapt is in maintenance mode. A processor that supports KSP is moved
by adding the KSP plugin and changing kapt(...) to ksp(...), module by module; data binding still needs kapt.
`kapt-processor` leans on it, and says it is a suggestion for that reason.

### Kotlin Symbol Processing API: supported libraries (Kotlin documentation)

https://kotlinlang.org/docs/ksp-overview.html

The overview of KSP, with a table of libraries that support it, among them Room, Moshi, Glide and Dagger, and Hilt
listed as in progress. The default `kspProcessors` lean on it and on the Android page above.

## The catalog format

### TOML v1.0.0 (toml.io)

https://toml.io/en/v1.0.0

The TOML format: comments with #, one key and value a line, bare keys of letters, digits, underscores and dashes,
quoted and dotted keys, basic and literal strings in one line or many, tables, inline tables that stay on one line with
no trailing comma, arrays that may span lines, and a key that may be defined only once. src/toml.js reads this part of
TOML and refuses arrays of tables and dates, which a catalog does not use. `unreadable-file` leans on it.

## Output and safe reading

### RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The CSV format: one record a line, ended by CRLF, an optional header line, and a field with a comma, a double quote or
a line break put in double quotes, with a double quote inside written twice. The CSV report follows it.

### RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON format. JSON exchanged between systems must be UTF-8, and a reader may ignore a byte order mark. When the
names of an object are not unique, the behavior of the software that reads it is unpredictable, so the configuration
reader refuses a name given twice.

### CSV Injection (OWASP)

https://community.owasp.org/attacks/CSV_Injection

A spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is
safe in every program. The CSV report puts a single quote in front of such a field, and the threat model says to open a
report built from files you do not trust with formulas turned off.

### Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The error, warning and notice commands with file, line, col and title parameters create annotations on a file and a
line of the repository. The GitHub format writes one command per finding and escapes what a command gives a meaning
to.
