---
title: Duplicate Records in Your Referral Data: How to Clean Them Up
slug: duplicate-records-cleanup
date: 2027-03-11
description: How to find and merge duplicate records in referral data, from misspelled facility names to one physician entered twice, and stop them returning.
tag: CRM hygiene
art: desk
keyphrase: duplicate records
takeaways:
  - Duplicate records split one source into several small ones, which hides your best relationships.
  - Merge by category, starting with facilities, then people, then patients or referrals.
  - Prevent new duplicates with pick-lists, one naming rule and a short weekly check.
---

If your report says you have eleven referring sources in a town and the truth is seven, you have a duplicate records problem. It's quiet, it's common, and it makes every number you share a little bit wrong. The good news is that it's fixable in an afternoon or two, and easy to keep fixed.

## Why do duplicate records matter?

Think about one busy cardiology practice. Over a year, five different people type its name five different ways. The report now shows five small sources instead of one large one. You'd never prioritize that practice, because none of the five looks important.

Duplicates also hide trouble. A source that looks like it stopped sending may simply have been renamed. A source that looks new may be an old friend with a different spelling. You end up visiting the wrong people and missing the right ones.

## Where do duplicate records come from?

Almost always from people being busy. An intake coordinator types what the fax header says. A liaison enters a name from memory. A new hire doesn't know there's already a record. Someone imports a spreadsheet from a trade show list and adds a few hundred near matches.

Common patterns include abbreviations ("Dr." and no title), "Saint" versus "St.", a practice name versus the physician's name, a hospital versus its outpatient clinic, and a person who changed their last name or moved employers and got entered again.

## What is the safest order for a cleanup?

Work from the top of the hierarchy down. Facilities first, because people sit inside them. Then the people at those facilities. Last, the individual referral records, which usually need only light fixes.

1. Export what you have to a spreadsheet. Don't start merging in the live system until you've looked at everything once.
2. Sort the facility list alphabetically and read it. Your eye will catch "Mercy Gen." next to "Mercy General" faster than any formula.
3. Decide on a standard name for each, and mark which duplicates fold into it.
4. Merge facilities. Then re-sort the people, this time by last name, and repeat.
5. Spot-check a handful of merged records to confirm nothing important was lost, like the date of the most recent referral.

Take a backup before any merge, because merges are hard to undo. If your system has a merge tool, learn how it treats history first. Some keep every past referral on the merged record. Some don't.

## How do you tell a true duplicate from a lookalike?

Be cautious. Two physicians with the same last name in the same building might be a married couple, a parent and child, or one person entered twice. Two clinics with the same name in different towns are not duplicates.

Use a second detail to confirm: an NPI number if you collect one, a phone or fax number, an address or a specialty. If you can't be sure, leave both and add a note. A missed duplicate is a small problem. A wrongly merged pair of different people corrupts the history of both.

> **Illustrative example**
>
> A small home health agency exports its referral sources and finds a physician group entered under four spellings.
>
> - Spelling A: 14 referrals
> - Spelling B: 9 referrals
> - Spelling C: 5 referrals
> - Spelling D: 2 referrals
>
> Merged, that's 30 referrals from one group. In the old report, the biggest of the four looked like 14, so the group ranked well behind a hospital that sent 22. As one source with 30, it moves ahead of the hospital. That's a very different visit list.

## How do you stop duplicate records from coming back?

Cleaning once without changing the habits just gets you a second cleanup in a year. Three small changes do most of the work.

- Use pick-lists for facilities. Free typing is where nearly every variation begins. Make adding a new facility a deliberate step that someone checks first.
- Write a one-page naming rule: how to spell a hospital, how to enter a physician (last name, first name), and what to do with a practice that has several locations.
- Have one person own the list. That person searches before creating a new record, and checks for lookalikes once a week for ten minutes.

Also be sensible about patient information. Referral data often connects to people's health details, so follow your own policies and your counsel's guidance on who can see and edit it, and don't copy it into casual spreadsheets that no one controls.

## How often should you check for duplicates?

A weekly skim and a quarterly pass is plenty. The weekly skim catches new ones while the memory is fresh. The quarterly pass sorts the whole source list again and looks for anything odd, like a source with a tiny count and a name close to a big one.

When you add a new data source, such as a portal feed or an imported list, check it before it mixes with the rest. That is where large batches of duplicates sneak in.

Wellby is built to match referrals to one consistent source, so the same practice doesn't appear four ways. The [platform](/#platform) overview covers the basics. You can also see [how it works](/#how).
