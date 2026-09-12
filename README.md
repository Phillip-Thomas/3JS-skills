# Three.js world-builder — portable bundle

Everything an agent needs to build the worlds this lab has been producing, and nothing that belongs to the lab.
The skill set is deliberately lean: one skill whose routing table names the technique and module for each subject.
A three-brief test scored equal or better than the earlier 33-specialist set, so those files are not shipped.
No judges, no batch scripts, no trajectory export: those stay in the lab. This is the deployable half.

## Layout (this is also the workspace layout the agent sees)

```
skills/threejs-world-builder/        the core skill: SKILL.md (build order, the measured rules of the strongest builds,
                                     checks), capabilities.md (routing table),
                                     tools/check.mjs (+ check-resolve.mjs): CPU check, no GPU — finite geometry, deterministic
                                     seek, activity, anchors framed, cameras clear, custody of moving objects, density profile
                                     tools/inspect.mjs (host sanity pass incl. interpenetration, back-lit stage and exposure
                                     flags; charged rendered looks)
references/techniques/*.js           the module sources the agent copies into ./world/ and imports:
                                     render-preset, surface-materials + pbr-fields (+ patterns), procedural-masonry,
                                     aperiodic-ground, wall-openings, support-frame, metric-surface, causal-state,
                                     parts (construction + living patterns: skinned figure, quadruped, fowl, hold/reach),
                                     characters (walk helpers), props (compositions)
references/techniques/HELPERS.md     one-page signature sheet the skill tells the agent to read
prompt-template.md                   the builder prompt; replace {{BRIEF}} with the brief text
invocation-template.txt              the message that starts the agent; replace {{WORKDIR}} and {{MINUTES}}
inspect.config.example.json          optional tool settings (browser path/args, GPU lock, look allowance)
variants/nolib/                      the same skill + prompt with every mention of shipped modules removed, for
                                     deployments where the agent is expected to write the modules itself
package.json                         pins: three 0.185.1, vite 8.2.2, playwright-core 1.63.0
```

## Running a build

1. `npm install` here once (Vite serves the world; Playwright drives Chromium for the inspection tool).
2. Make a workspace directory per build containing: `prompt.md` (from the template), an empty `world/`, and links or copies of
   `skills/`, `references/` and `node_modules/`. Put `inspect.config.json` in the workspace's PARENT directory if you need
   custom browser settings (keeping it out of the workspace keeps it out of the agent's trace).
3. Start the agent with `invocation-template.txt`. The agent copies the modules it needs into `./world/`, writes
   `index.html` + `main.js`, runs `node ./skills/threejs-world-builder/tools/check.mjs` (CPU, seconds) and
   `node ./skills/threejs-world-builder/tools/inspect.mjs --sanity` (free) after every edit, spends at most `limit` rendered
   looks (`--views 0,4,5 --times 24`), fixes what it sees, and ends with `./answer.txt` and `./technique-use.json`.
   The CPU check resolves `three` from the workspace's `node_modules` link, so keep that link next to `./skills`.
4. The delivered world is `./world/` and runs from any static server that resolves bare `three` imports (Vite here).

Environment the tool honours: `INSPECT_CONFIG` (config path), `INSPECT_LIMIT` (looks), `INSPECT_CHROMIUM`,
`INSPECT_BROWSER_ARGS`, `INSPECT_HOST_SERVICE=1` (ask a host service to render instead of launching a browser).

## What "current outcomes" means

Opus-class builders at 15 minutes produce complete, action-bearing, sanity-clean scenes whose people and animals come from
the living patterns (seeded faces, hair, fabrics with woven shader textures, stride locked to distance, props held in hands)
and whose props are composed from the construction patterns. See the lab's `sft1-RESULT.md` for the measured grades.
