# Harborlight Rides: a build before the dependency review

A made-up bike rental company has an Android app with two modules, `app` and `core`, and a version catalog in
`gradle/libs.versions.toml`. A new team is taking the codebase over and reviews the dependency setup first. The build
has gone wrong in the ways such a review finds:

- the catalog has a library no build file uses (`picasso`) and a version nothing uses (`timber`);
- the library `glide` has a version.ref to a key, `glide`, that [versions] does not have;
- the version `okhttp` is `4.+`, a dynamic version;
- the library `core-ktx` names `androidx.core:core-ktx` again, with another version than `androidx-core-ktx`;
- `app/build.gradle.kts` writes three dependencies with their version instead of using the catalog, one of them from
  the Support Library (`com.android.support:appcompat-v7`), and gives the Compose library `ui-tooling-preview` a
  version next to the Compose BOM, as the catalog does for `compose-material3`;
- the Room compiler runs with kapt, though it also runs with KSP;
- `settings.gradle.kts` still reads from `jcenter()`, and `core/build.gradle` from `mavenLocal()`.

It also holds what must not be reported: a dependency and a dynamic version in comments of `core/build.gradle`, the
libraries used through the bundle `room`, the Compose library with no version, the version `compileSdk` read through
`libs.versions`, a copy of a Gradle file under `app/build`, which is never read, and the module `legacy`, which
`../config.json` leaves out with `"exclude": ["legacy/**"]`.

```
node bin/version-catalog-check.js examples/messy --config examples/config.json
```

The version of the Compose BOM is a date in real life; the catalog writes a stand-in number, 3.2.0, because this
repository holds no date. The Gradle files are made-up input for the tool, not a build of this repository.
