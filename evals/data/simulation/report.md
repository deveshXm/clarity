# Clarity simulation eval — results

**47 cases · 47/47 correct (100.0%) · 44.7s**

## Case accuracy by type

| Type | Correct |
|------|---------|
| positive | 24/24 (100.0%) |
| hard_negative | 18/18 (100.0%) |
| harmful | 5/5 (100.0%) |

## Per-flag precision / recall / F1

| Flag | P | R | F1 | TP/FP/FN |
|------|---|---|----|----------|
| Disrespectful | 62.5% | 100.0% | 76.9% | 10/6/0 |
| Passive-Aggressive | 100.0% | 100.0% | 100.0% | 5/0/0 |
| Dismissive | 100.0% | 80.0% | 88.9% | 4/0/1 |
| Unclear / Not Actionable | 100.0% | 100.0% | 100.0% | 5/0/0 |
| Unconstructive / Demoralizing | 100.0% | 100.0% | 100.0% | 5/0/0 |

## Harmful gate

precision 100.0% · recall 100.0% · TP=5 FP=0 FN=0 TN=42

## Over-flagging on clean messages

0/18 clean messages wrongly flagged (0.0%)

## Misses

None 🎉
