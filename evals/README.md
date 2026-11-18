# Evals

Empty until M2. Evaluation cases are frozen from real pipeline runs: the
pipeline stores every run's echoes, assignments and summaries from day one,
and selected runs are copied here.

Planned metrics:

- **Automatic:** contract pass rate, valid-citation rate, language
  completeness, repair rate, provider-fallback rate.
- **Human-labelled:** agreement with the owner's topic assignments on a small
  set; spot checks of Chinese and Japanese readability.

A PR that changes a prompt, the judge package or the provider configuration
must include the eval result. This directory is a protected path.
