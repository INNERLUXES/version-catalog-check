# 2. Read Gradle files as text, and the catalog with a small TOML reader

## Status

Accepted

## Context

The facts the checks need sit in two kinds of files. The catalog is TOML, a small format with a written specification.
The build files are Groovy or Kotlin programs: a dependency can be built from a variable, a loop or a function, and only
Gradle running the script knows the result. Running Gradle would need a JDK, the Android SDK, the network to fetch
plugins, and would execute code from the repository under review, which in a pipeline that checks pull requests may be
written by anyone.

Most build files of Android projects use a few fixed forms: implementation(libs.x), implementation("g:n:v"),
alias(libs.plugins.x), id("..."), jcenter(). A TOML library would bring code the project does not review and versions to
track, for a part of TOML a catalog uses.

## Decision

1. The catalog is read by src/toml.js, a small TOML reader with no dependency. It reads the text once, left to right,
   with a list of open arrays and inline tables of its own and no recursion, with limits of depth, values, string
   length and key parts. It reads the part of TOML 1.0 that catalogs use and refuses the rest (arrays of tables, dates)
   with its place, rather than guess. It keeps the offset of every key and value, so each finding has a line and a
   column.
2. A Gradle file is read as text by src/gradle.js: comments and strings are set apart, then a few forms are found by
   their shape. Nothing in a comment or a string counts. The forms read are listed in docs/method.md, and the forms
   that are not are listed in docs/limits.md.
3. The tool never runs Gradle, Groovy or Kotlin, and never evaluates anything it reads.
4. The accessor of an alias is made as Gradle makes it, so a reference is matched to its entry by the longest start of
   the chain that is an accessor.

## Consequences

- The tool needs no JDK, no SDK and no network, runs in a second on a large project, and the same files give the same
  report on Linux, Windows and macOS.
- It is a heuristic: a dependency built in code is not seen, and an entry used only from code that is not a Gradle file
  is reported as unused. The report says so, docs/limits.md lists the forms, and every rule can be set to info or off.
- A catalog that Gradle would read but that uses a part of TOML the reader refuses is an `unreadable-file` finding;
  adding that part is a change to the reader, with its tests.
