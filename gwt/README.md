# Glossing-model comparison site

Static, server-free site for manually comparing the Gawar-Bati glossing models
(7 LoRA sizes × 5 translation conditions + un-finetuned base = 40 runs) on the
Jawarya/MeraKhan test set.

## Open it

Just open `index.html` in a browser — no server needed (`data.js` loads via a
`<script>` tag, which works from `file://`).

## Regenerate the data

`data.js` is built from the WandB run tables + the `gawarbati_metalangs`
(translations) and `gawarbati_morphemes` (vocab) data files:

```
cd gawarbati_qual-eval
python build_site.py                 # build every eval (tables cached in _site_cache/)
python build_site.py --eval notl     # just one eval
python build_site.py --offline       # rebuild from cache only, no WandB call
```

Six evaluations, switched with the "Test-time translation" buttons (or `?eval=<key>`):

| key | WandB project | test-time translation | writes |
|---|---|---|---|
| `matched` | the diagonal of the rows below | the LoRA's own training condition | `site/data.js` |
| `gls_en`, `gls_ur`, `gtr_en`, `lit_en` | `gwt-gtr` | that condition, for every LoRA | `site/data_<cond>.js` |
| `no_translation` | `gwt-notl` | none, for every LoRA | `site/data_no_translation.js` |

In the per-condition evals the condition axis is the condition the LoRA was *trained*
with; size, training and test condition are read from each run's config
(`local_dataset_path`, `adapter_dir`, `translation_condition`). The base model's run
for each test condition comes from `gwt-metalang`; that project's LoRA runs are an
older checkpoint and aren't used.
Runs that haven't finished are skipped and not cached, so re-run the build once
they're done.

Requires WandB auth (already in `~/.netrc`) on the first run. Scoring reuses the
parsing/alignment code in `compare_morphemes.py`, so segmentation accuracy
reproduces `morpheme_summary.csv` exactly.

## Notes on the numbers

- **UNK gold glosses** (45 morphemes whose gold gloss is unknown) are excluded
  from every gloss-accuracy figure — a model's gloss for them is neither right
  nor wrong. Segmentation is still scored for them. This makes gloss accuracy
  here slightly higher than in `morpheme_summary.csv`, which counted them.
- **Morpheme error rate / segmentation F1** are polygloss's metrics
  (`polygloss/src/evaluation/evaluate.py`, reimplemented in `polygloss_metrics.py`):
  per-sentence, macro-averaged, so they can't be faceted by morpheme type or
  vocabulary. MER skips gold UNK morphemes as the current `evaluate.py` does; the
  values logged to WandB were computed before that change (they match this code
  with UNK kept), so they are a few points higher. Segmentation F1 matches WandB.
- **Lexical vs grammatical** (binary): a gloss is *lexical* if any `.`-separated
  component has a lowercase letter or is exactly `I`; else *grammatical*.
- **In-vocab**: a form+gloss is in-vocab for a model if it appears in any of that
  model's training texts (base is always OOV). Training texts per speaker: Gul Muhammad
  `20160110-GulMuhammadFolkTale`, Din Muhammad `20151225-DinMuhammadFolkTale` (not
  `20151215-DinMouhdFolkTals`, which no model was trained on), Abdul Jalil
  `20230827-AbdulJalilTellingFolkTale`.
- **Baseline** (`baseline-<size>`, shown as condition `baseline`, dashed grey): for
  each test word, the most frequent segmentation+gloss of that surface word in the
  size's training texts (ties: first seen); an unseen word is predicted as one
  unsegmented morpheme with the most frequent monomorphemic word gloss (`PTCL` for
  every size). It ignores translations, so it's the same in every eval. Built from
  `gawarbati_metalangs/*.csv` by `build_site.py`, which checks that the same reader
  reproduces every gold test reference.
- **Sentences tab** shows each model's *full* predicted segmentation, so
  over/under-segmentation is visible; morphemes are colored against the gold
  alignment (correct gloss / wrong gloss / seg-miss-or-extra / UNK).
