# Anxiety Extraction Pipeline Fix — Iteration Log

## Targets
- **Primary**: Anxiety MAE < 1.5, Pearson r > 0.5
- **Stretch**: Anxiety MAE < 1.0, Pearson r > 0.7
- **Constraint**: Do not regress mood accuracy

## Results

| Iteration | Change Made | N | Anxiety MAE | Anxiety r | Mood MAE | Mood r |
|-----------|-------------|---|-------------|-----------|----------|--------|
| Baseline | None | 29 | 2.48 | 0.010 | 0.55 | 0.847 |
| v2 | Prompt anchoring + anxiety-aware synthetic data | 24 | 1.63 | 0.529 | 0.67 | 0.844 |
| v3 | Guaranteed anxiety theme selection when anxiety >= 5 | 14 | **1.36** | **0.740** | 0.57 | 0.879 |

Note: v2 and v3 had reduced N due to OpenAI API quota limits (429 errors). Metrics are
computed on the entries that completed successfully.

## Per-Archetype Anxiety MAE

| Archetype | Baseline | v2 | v3 |
|-----------|----------|-----|-----|
| hidden_deteriorator | 0.60 | 0.50 | 0.67 |
| flat_non_responder | 2.20 | 1.40 | 1.33 |
| early_dropout | 3.00 | 2.00 | 1.50 |
| volatile_stabilizer | 2.00 | 2.00 | n/a (all 429) |
| gradual_improver | 4.20 | 2.60 | 2.00 |
| relapse_then_recover | 3.00 | 1.00 | n/a (N=1) |

## Changes Made

### v2: Prompt + Synthetic Data Overhaul
1. **Prompt** (`prompts/symptom_extraction.txt`):
   - Replaced sparse anxiety definition with 5-level anchoring scale (1-2, 3-4, 5-6, 7-8, 9-10)
   - Added indirect anxiety indicators list (sleep, rumination, avoidance, physical tension, etc.)
   - Added mood-anxiety independence instruction
   - Added GAD-7 cross-check rule

2. **Synthetic data** (`lib/synthetic/journal-generator.ts`):
   - Added `getAnxietyBand()` function and `ANXIETY_DRIVEN_THEMES` set
   - Added 4 new anxiety theme sentence sets: `worry`, `physical_anxiety`, `avoidance`, `hypervigilance`
   - Restructured `panic` and `rumination` to use anxiety bands (swapped low/high)
   - Updated `generateJournalEntry()` to accept anxiety parameter
   - Anxiety-driven themes now select sentences based on anxiety band, not mood band

3. **Archetype configs** (`lib/synthetic/archetypes.ts`):
   - Added anxiety themes to all 6 archetype theme pools
   - Updated `pickThemes()` to accept anxiety and weight anxiety themes when anxiety >= 6

4. **Cohort generator** (`lib/synthetic/cohort-generator.ts`):
   - Passes anxiety to `pickThemes()` and `generateJournalEntry()`
   - Generates proper anxiety evidence snippets (was hardcoded to empty array)

### v3: Guaranteed Anxiety Theme Selection
- Modified `pickThemes()` to force-select at least one anxiety theme when anxiety >= 5
- Tripled anxiety theme weighting in pool when anxiety >= 6
