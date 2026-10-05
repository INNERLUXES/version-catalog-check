# Threat model

## What the tool touches

- It reads the files below the project folder named on the command line whose names end with .gradle or .gradle.kts,
  the catalogs of docs/inputs.md, and the configuration named with `--config`. It lists the folders of the project to
  find them. Nothing else is opened.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no address it reads, follows no symbolic link, evaluates nothing it reads,
  runs no Gradle and no other program, and reads no clock.

## What the input may hold

The catalogs and the Gradle files come from a repository, and in a pipeline that checks every pull request they may be
written by whoever opened the pull request. Through them, a person can try to:

- make the tool read outside the folder or fetch something: a symbolic link or a junction in the project, a link named
  on the command line, a file swapped for a link between the listing and the read, a catalog the settings file reads
  from `../` or an absolute path, a catalog taken from a published artifact, a path written as a web address;
- exhaust the memory, the stack or the time: files of megabytes, projects with tens of thousands of files, folders
  nested very deep, TOML nested very deep or with runs of hundreds of thousands of brackets, quotes or escapes, Gradle
  text with runs of quotes, comments, templates, references or braces, catalogs of thousands of entries, patterns with
  many wildcards;
- move the result: a rule set to off, a BOM or a deprecated coordinate removed from the configuration, `failOn`
  raised, an exclude pattern that leaves out the module with the problem, a dependency written in a form the heuristic
  does not read;
- slip in something that is not text: a binary file named build.gradle, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators in
  a file name, an alias, a version or a coordinate;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the GitHub
  format writes into a command;
- hide a formula in the CSV report: a version, an alias or a path that starts with `=`, `+`, `-` or `@`, which a
  spreadsheet may run when the report is opened;
- change how objects behave: an alias, a version key or a table named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read outside the folder or walk a loop | Every link met in the listing is counted and none is followed, a link named on the command line or with `--catalog` is refused, and the default catalog through a link is an `unreadable-file` finding; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle. Tests put links to a file and to a folder in the project |
| A settings file makes the tool read a catalog outside the project | A path of versionCatalogs is resolved against the project folder and refused when it leaves it; a published catalog is never fetched |
| The tool fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, Gradle is never run, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | Files have a size limit checked on the open handle before they are read; the listing has limits of entries, depth and Gradle files; the TOML reader keeps a list of its own with no recursion and has limits of depth, values, string length and key parts; the Gradle reader reads each file once, sets strings apart with a filler so that looking back never walks through them, looks back at most 4,096 characters, and caps strings, references and blocks; patterns are matched in time bounded by their length; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the input or the configuration; exclude and coordinate patterns are matched by a small matcher of the tool's own. A test looks for `new RegExp` in src |
| The result is moved through the input or the configuration | A file that cannot be read and input past the limits are error findings that cannot be set off; a rule set to off and every exclude pattern are named in the report; the readers refuse what they do not read rather than guess. Review a change to the configuration like a change to code (docs/secure-defaults.md) |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes or a broken pair in UTF-16, and bytes that are not valid make the file an error finding |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts escapes, direction controls and line separators in a version, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `%0A::error file=` and a line break with `::warning::` into a version |
| A formula runs when the CSV report is opened | A field that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a single quote in front. The OWASP page on CSV injection says no one escape is safe in every program, so treat a report built from files you do not trust as untrusted data, and open it with formulas off |
| `__proto__` changes how objects behave | Tables of the catalog are kept in Map objects, names are looked up in lists, maps and sets or with `Object.hasOwn`, and the configuration reader defines own properties. A test uses `__proto__`, `constructor`, `toString` and `hasOwnProperty` as aliases and keys |
| A device or a pipe hangs the tool | A path that is not a regular file or folder is refused before it is read, and the listing passes over every entry that is not a file or a folder |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folders as they were |

## Out of scope

The versions Gradle resolves, whether a library is safe or up to date, the forms of a Gradle file docs/limits.md
leaves out, who may change the configuration in your repository, and where your pipeline keeps the output.

A clean result is not a Gradle build and not a dependency resolution.
