# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "version-catalog-check security", or use private vulnerability
reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up project, catalog or configuration that shows the problem, the command you ran, what you
expected and what happened. Use made-up companies, apps and people, never the build files of a real app, and never a
real credential, signing key or token, even an old one.

## Scope

In scope:

- an input that makes the tool read a file outside the project folder, the catalogs and the configuration it was
  given, or follow a symbolic link or a junction
- an input that makes the tool open a network connection, fetch an address or a published catalog it reads, run
  Gradle or any other program, or evaluate any part of a file
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as very large
  files, projects with very many files or folders, TOML nested deep, or long runs of quotes, brackets, comments or
  references
- binary or invalid input that the tool reads as if it were a catalog or a Gradle file
- a catalog or a Gradle file the tool fails to read and passes over without an error finding
- a problem that docs/method.md says is reported but that a form of the catalog or of the build file it says it reads
  hides from the tool
- a run that passes at a `failOn` level although the input holds a finding at that level that docs/method.md says is
  reported
- text from a file or a file name that rewrites the terminal through control or direction characters, starts or ends a
  GitHub workflow command, is shown unescaped in the output, or starts a formula in the CSV report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, what Gradle resolves and whether a library is safe
or up to date (a clean result is not a Gradle build and not a dependency resolution), who may change the configuration
in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
