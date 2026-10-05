# 3. Check the files on disk, and fetch nothing

## Status

Accepted

## Context

Some facts about dependencies live elsewhere: the versions a repository holds, the versions a BOM aligns, the catalog a
settings file takes from a published artifact, and whether a library is still in JCenter or Maven Central. A check
could fetch the BOM, query Maven Central for the latest version or download a published catalog. Each would need the
network, would make the result depend on the state of a server, and would let a file in a pull request make the
pipeline reach an address it names.

What matters in a review of the dependency setup is what the repository says: the catalog and the build files as they
are written.

## Decision

1. The tool reads the project folder, the catalogs of docs/inputs.md and the configuration, and nothing else. It
   fetches nothing, resolves nothing, runs no program and calls no service.
2. The BOMs are known by a list in the configuration: when a BOM is declared in the project, a library it aligns that is
   declared with a version of its own is reported. Which version the BOM holds is not looked up.
3. A catalog the settings file takes from a published artifact is not fetched, and a note says so; a local copy can be
   named with `--catalog`. A catalog the settings file reads from outside the project folder is reported and not read.
4. The tool never says what the latest version of a library is, and never says that a version is old.

## Consequences

- The result depends only on the files, and a run needs no network access, no secret and no Gradle.
- What Gradle resolves in the end, which version a BOM picks and whether a newer version exists are not checked
  (docs/limits.md).
- The default lists of BOMs, deprecated coordinates and KSP processors are data in src/defaults.js, each after a public
  page, and a team adds its own in the configuration.
