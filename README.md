[![Latest stable Version](https://img.shields.io/github/v/release/CePeU/Note-To-Foundry?filter=*stable&sort=semver&display_name=tag&label=Latest%20stable%20Version)](https://github.com/CePeU/Note-To-Foundry/releases/latest)
![GitHub all releases](https://img.shields.io/github/downloads/CePeU/Note-To-Foundry/total)
[![License](https://img.shields.io/github/license/CePeU/Note-To-Foundry)](LICENSE)
[![Latest pre-release](https://img.shields.io/github/v/release/CePeU/Note-To-Foundry?include_prereleases&filter=*-stable!&sort=semver&label=Latest%20Prerelease)](https://github.com/CePeU/Note-To-Foundry/releases)
![Info](https://img.shields.io/badge/info-upcoming:%20exportprofiles%20as%20frontmatter-FFE417)  

# Documentation

You will find a good and helpfull documentation following this link:
![Dokumentation NotesToFoundry](https://cepeu.github.io/Note-To-Foundry)

Below you only will find some boring history.

## Why Obsidian and not directly in Foundry

This is a purely personal view and while I love Foundry as a VTT it sucks in comparison at preparation/journal handling:

### Foundry Cons
- The devs only improve marginally on Foundry journals. Journals are only a second or third thought in their considerations. (even their own
content creators are affected by this if I am informed correctly)  
- The editor sucks even though it could be made better with just a bit of effort (undo is implemented only as keybinding so not easily found by new users,
  font handling is a mess, HTML sanitizing at least until V14 seemed to have been rolled up in a wild magic zone, etc.).
- Campaign management has improved but is not nearly on par with the current plugins (as of 01.10.2026) which have become available in the last 9 months for Obsidian (also due to AI coding assistance).
- It is a VTT (more or less)

### Obsidian pros
- Better editor (with plugins, undo, formatting etc.)
- Dataview plugin and now Base    
(even if you need to use Dataview or Datacore and not Base to utilize my plugin to it's fullest potential!   
Take a look at: [NPC overview](https://github.com/CePeU/Note-To-Foundry/wiki/Demo))
- Second window during gameplay (one for Foundry one for Obsidian = more Screen size)
- note centric + a lot of plugins for TTRPG like for example the Gantt-this plugin or the TTRPG Maps plugin
- better/easier backup
- better search and organization of notes

# Foreword

A long time ago now it seems I read the following line:

_"Stories grow from stories told"_

The same can be said about software. I am a long time pen and paper player and even before the online VTT hype coming with corona which
brought dozens of VTT software to the market I was already playing online by Skype (for 10 years) with my long time 20 year old group 
(so yes I am probably an old grandpa).
I discovered Foundry VTT and it hooked me at once with its ability to expand it with plugins, one-time payment and self hosting.
Lately they did not give so much concern to some basic functionality I deem essential in a VTT in my personal opinion - which are journals. They changed
the editor to ProseMirror which only improved now on V14 and was not able to import HTML in the same way as the old editor did. I did not yet have time
to test it extensivly in V14. 
I understand fully the economic drive to expand on new flashy graphical enterprises moving Foundry VTT more towards a computer game but the 
essentials of a virtual TABLE top are in my eyes still handouts and text. I then discovered Obsidian MD which is a great tool
for managing content and text for a GM, but getting content out of Obsidian and to Foundry was mildly spoken a pain. There are tons of
HTML exporters but none of them could satisfy me and all needed additional manual adjustments which I needed to do outside in a second convoluted step (often needing pandoc or similar tools).
Then funny as it sounds I found out by coincidence and due to personal contact about an HTML exporter that essentially did what I needed.
Blotspot released a derived work (https://github.com/blotspot/obsidian-markdown2html) this is where the line changes to:

_"Software grows from software shared"_

It was not exactly what I needed but it was a great foundation! So we are back to another famous analogy:

_It was scary stuff, but radically advanced. I mean, it was great, it didn’t work the way I needed it, but... it gave us ideas, took us in new directions. 
I mean, things we would have never... All my work is based on it._

That’s when I searched for a way to import things into Foundry VTT to automate things and funny coincidence again I found a 2–3 month old newly released
REST API module for Foundry VTT. Best of all the code was MIT AND the necessary relay server can be self-hosted! PERFECT!

So I decided to do it on my own. I had never really done something bigger than a macro in JavaScript or even touched TypeScript. I learned tons about both
doing this project. After all there is nothing better than to learn hands-on a project. Still I would call this an early first release.  
It was pretty stable and there are at least 10 other things I wanted to improve upon. Also my code surely was not elegant or exceptional.
There was much to do in that regards BUT it worked! I was happy.

Then the inevitable happened - an upgrade to the REST module and a new and better and safer way to authorize agains Foundry. Also headless login got improved
and a lot of new endpoints have been added. So I had to update my plugin. I left it broken for 3 months. I loved it but it took me 3-6 months to get it even
developed and the code was ... well as I said not very good. I also had a big campaign going and was not able to find the time to update it.

And yes I found an AI coding Agent and he codes much better than me. I stuck my code into is greedy little fingers and he updated it to the new API and structured
it much better than it was before. So now it works with the new API and is probably much more robust that what I came up with.

But still if you like this and I hope you do. Well I am pretty sure you will like it as a GM, then keep both authors of the first building blocks of this plugin in mind:

Blotspot has a Ko-fi Link in her manifest.json (https://ko-fi.com/blotspot).  
ThreeHats has also a Patreon find out more here (https://github.com/ThreeHats/foundryvtt-rest-api).

Also maybe give me a tip - once I figure out how to set that up - I think my age shows here. Grateful for any tip how to do it.

I also tried to keep HTML export and Foundry upload as separated as possible and I improved a lot on flexibility I think. That way you even can use it as your static site
generator.

I also want to thank the Discord members on the Obsidian plugin-dev channel!  
@saberzero1  
@TyXaNuch  
@joethei  
@mnaoumov has been exceptionally kind and helpful!! Thanks!!  

## What it does

1. Converts the Markdown content of a note to HTML (either selected text or entire document) using Obsidian's markdown renderer. It also gives the option to export to Foundry VTT.   
2. Cleans up the HTML from the clutter obsidian (naturally) adds
   - Removes all attributes from tags (a list of attributes to keep can be configured in the settings)
   - Removes all classes (a list of classes to keep can be configured in the settings)
   - Can convert internal images into base64 strings
   - Removes empty paragraphs and divs (left overs from comment blocks, for example)
   - allows for export profiles
   - allows for HTML tag replacement
   - allows for HTML modification with regex expressions
   - allows to save HTML export to files (Linux file export could use more testing)
   - allows to add a footer and header section for the exported HTML (so you can add a body tag and "style.css" for the file export)
   - allows to add your own JavaScript code (macro) to manipulate and adjust the HTML before export
   - allows to upload as journal to Foundry VTT
   - also uploads pictures and fixes picture paths for Foundry VTT so pages are linked together
   - allows to relinking exported journal entries according to the Obsidian links
   - (planned if possible: batch export and relinking of stale links if a page is deleted and reexported)
   - (planned: test it more in deepth on Linux)


## Tested on

- Desktop (Windows/Linux)

## Installation

### From Github

1. Download the latest release from the [releases page](https://github.com/CePeU/Note-To-Foundry/releases).
2. Unzip the downloaded file.
3. Copy the folder to your Obsidian plugins directory (usually located at `.obsidian/plugins`).
4. Enable the "Note-To-Foundry" plugin from the Settings > Community Plugins menu in Obsidian.

### As beta plugin (using BRAT)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Community Plugins in Obsidian.
2. Open the command palette and run the command `BRAT: Add a beta plugin for testing`
3. Copy the project link (https://github.com/CePeU/Note-To-Foundry) into the modal that opens up.
4. Make sure **Enable after installing the plugin** is checked
5. Click on **Add Plugin**

#### Updating

Beta plugins can be updated using the command palette by running the command `Check for updates to all beta plugins and UPDATE`. Optionally, beta plugins can be configured to auto-update when starting Obsidian. This feature can be enabled in the BRAT plugin settings tab.

## API Documentation

- Obsidian: [https://github.com/obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api)









