# Fernbrook Notes: a build in good order

A made-up company has an Android notes app with one module, `app`, and a version catalog in
`gradle/libs.versions.toml`. Every library, bundle, plugin and version of the catalog is used; the Compose libraries
have no version of their own and follow the Compose BOM through the bundle `compose`; the Room compiler runs with KSP;
`compileSdk` is read through `libs.versions`; and the settings read from the Google repository and Maven Central only.

```
node bin/version-catalog-check.js examples/clean
```

The version of the Compose BOM is a date in real life; the catalog writes a stand-in number, 3.2.0, because this
repository holds no date. The Gradle files are made-up input for the tool, not a build of this repository.
