# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

A review of dependencies tempts a tool to look at the calendar and the network: how old a version is, whether a newer
one came out last month, when JCenter stopped taking packages, how long ago the Support Library had its last release.
Each of these would make the same files give a different result on a different day, so a pipeline that passed
yesterday could fail today with no change to the repository, and two people reading the same commit could see two
reports. The output could never be saved and compared.

The checks do not need a date. Whether an entry is used, whether a version.ref has its key, whether a version is a
range, whether a library is declared twice: all of it can be read from the files as they are. Some versions are dates
in real life, such as those of the Compose BOM; the tool reads them as text and never as a date.

## Decision

1. The tool reads no clock, no time zone and no locale. It never prints the current time and never says how old a
   version is or what the latest version is. The same files and configuration give the same output on every machine
   and on every day.
2. The tool fetches nothing, so no version is looked up ([decision 3](0003-check-the-files-on-disk-and-fetch-nothing.md)).
3. No file of this repository holds a date or a number that reads like a year: not the licence, not the changelog, not
   the documents, not the comments of the code, not the tests, not the examples. `npm run check` and a test fail on any
   word of four digits that starts with 19 or 20. The examples write the version of the Compose BOM, which is a date in
   real life, as a stand-in number, 3.2.0, and say so.
4. A library version is not a year and is not caught: 1.9.0, 2.11.0 and 4.13.2 hold no word of four digits. A test of
   test/repo.test.js runs the pattern over the versions of the examples and checks that none of them is caught, and
   that a year in the same place still is; the pattern is the same in the tests and in tools/check.mjs.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it does
  not move with the calendar.
- An old version is not reported as old; docs/limits.md says so, and a team that wants that keeps a separate update
  tool for it.
- The values of the examples are chosen so that no version, size or count reads like a year, and a check catches one
  that does.
