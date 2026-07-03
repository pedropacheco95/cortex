# Adversarial Investigation

This document describes the protocol for challenging potential bugs, dead features, and
coupling issues before classifying them. This is Phase 3 of onboarding.

## Principle

Before any behavior is classified as a bug, every alternative explanation must be
exhausted. The question is not "does this look wrong?" — it's "can I construct a
plausible defense for why a developer wrote it this way?"

Code that survives adversarial investigation is classified as correct behavior. Code
where no defense holds is classified as a bug. Code where the defense is weak gets
escalated to the human with both sides presented.

## When to investigate

Every item flagged during Phase 2 as:
- A potential bug (behavior that seems wrong)
- Dead code (code that seems unreferenced)
- An inconsistency (two parts of the codebase doing the same thing differently)
- Accidental coupling (dependencies that seem unnecessary)

Do NOT investigate items that are clearly factual observations (an entity has field X,
an endpoint returns status Y). Only investigate *judgments* about correctness.

## Agent delegation

Each potential bug gets its own investigation agent. The agent receives:

1. **The flagged code** — file path, function, the specific behavior in question
2. **The proposed "correct" behavior** — what the orchestrator thinks the code should do
3. **The atom graph context** — which atoms call this code, which atoms it calls, which
   entities it touches
4. **Instructions** — "Build the strongest possible case that this code is correct.
   Try every defense below. Report what you find."

The investigation agent returns a structured investigation record (format below).

## The five defenses

The agent must attempt every defense in order. Each defense is a different angle of
attack on the assumption that the code is wrong.

### Defense 1: Business justification

"What business reason could justify this behavior?"

- Is there a domain-specific convention the agent might not know?
- Could this be handling an edge case that seems wrong in isolation but makes sense in
  the full business context?
- Is there an industry standard or regulatory requirement that dictates this behavior?
- Could this be a deliberate trade-off (performance vs. correctness, simplicity vs.
  completeness)?

**Where to look:** README, documentation files, code comments, commit messages near the
relevant code, any product docs in the repo.

### Defense 2: Systemic pattern

"Does the codebase do this same 'wrong' thing consistently?"

- Search for the same pattern across the codebase
- If 5 endpoints all handle errors the same "wrong" way, it's a convention
- If only 1 endpoint differs from the other 4, the 1 is more likely the bug

**Where to look:** Grep for the same pattern, function name, or approach across all files.

```
# If the "bug" is floor rounding:
grep -r "math.floor\|Math.floor\|FLOOR(" src/

# If the "bug" is returning 200 instead of 201:
grep -r "status.*200\|status_code.*200" src/routes/
```

### Defense 3: Caller/callee expectations

"Do the callers and callees expect this exact behavior?"

- Trace every caller of the flagged code. What do they do with the result?
- If callers handle the "wrong" return value correctly, they were written to expect it
- Trace every function the flagged code calls. Does it make sense given what it receives?
- Follow the chain in both directions — 2-3 levels deep if needed

**Agent delegation:** The investigation agent reads the caller chain and callee chain.
For deep chains (3+ levels), it may need to read many files. This is why investigation
is delegated — the orchestrator can't hold all this context.

**Where to look:** Search for every call site of the flagged function.

```
# Find all callers:
grep -r "function_name\|functionName" src/ --include="*.py" --include="*.ts"
```

### Defense 4: Would the fix break something?

"If we changed this to the 'correct' behavior, what would break?"

- Mentally apply the proposed fix
- Trace every downstream consumer — would they handle the new behavior correctly?
- Check integrations — does an external system depend on this exact behavior?
- Check the database — would a schema change be needed? Would existing data become invalid?

**This is the strongest defense.** If fixing the "bug" would break 3 other things, the
current behavior is likely a deliberate compromise. The real fix might be larger than
just changing this one function.

### Defense 5: Compensating code

"Is the 'bug' handled somewhere else?"

- Search for error handling, fallbacks, or validation that addresses the concern
- A missing null check in function A might be fine if the caller always validates first
- A missing input validation in the API might be fine if the frontend always validates
  (though this is a weak defense — defense in depth says the API should validate too)

**Where to look:** Search for the entity/field name in validation, middleware, and
error-handling code.

## Classification rules

| All defenses fail | Defense is weak/speculative | Defense is strong |
|---|---|---|
| Bug (HIGH confidence) | Needs human judgment (MEDIUM) | Correct behavior (HIGH) |

A strong defense has concrete evidence: code that demonstrates the pattern, callers that
depend on the behavior, tests that assert it, documentation that explains it, or an
external system that requires it.

A weak defense is speculation: "maybe there's a business reason" without evidence,
"perhaps an external system needs this" without finding which one.

## Investigation record format

Every investigated item produces a record appended to `proposed-notes.md`:

```markdown
## INV-001: [Short description of the flagged behavior]

**Initially flagged as:** [Bug / Dead code / Inconsistency / Coupling issue]
**Classification after investigation:** [Bug (HIGH) / Needs human judgment (MEDIUM) / Correct behavior (HIGH)]

**Defense 1 (business justification):**
[What was found, or "No business justification identified"]

**Defense 2 (systemic pattern):**
[Pattern search results — how many other places do the same thing]

**Defense 3 (caller/callee expectations):**
[Callers examined, what they expect, whether behavior matches]

**Defense 4 (would fix break something):**
[What would break if the "correct" behavior were implemented]

**Defense 5 (compensating code):**
[Whether the concern is handled elsewhere]

**Conclusion:** [One sentence summarizing why the classification was chosen]
```

### Example: Bug confirmed

```markdown
## INV-002: Login endpoint accepts empty password string

**Initially flagged as:** Bug (missing validation)
**Classification after investigation:** Bug (HIGH confidence)

**Defense 1 (business justification):**
No business reason to accept empty passwords. Security best practice requires non-empty.

**Defense 2 (systemic pattern):**
All other input validation endpoints reject empty strings. 8/8 endpoints validate input
length. This endpoint is the only one that doesn't.

**Defense 3 (caller/callee expectations):**
Frontend validates password length >= 8. No caller depends on empty passwords being accepted.
The auth service's hash function works on empty strings (doesn't crash), but this is
incidental, not intentional.

**Defense 4 (would fix break something):**
Adding validation would only reject invalid input. No legitimate user sends empty passwords.

**Defense 5 (compensating code):**
Frontend validates, but API should enforce independently (defense in depth).

**Conclusion:** No plausible defense. Every signal confirms this is a validation gap.
```

### Example: Correct behavior confirmed

```markdown
## INV-003: Invoice rounding uses floor instead of ceil

**Initially flagged as:** Bug (incorrect rounding)
**Classification after investigation:** Correct behavior (HIGH confidence)

**Defense 1 (business justification):**
Payment processors commonly use floor rounding for partial cents.

**Defense 2 (systemic pattern):**
floor() used consistently in all 4 financial calculation functions:
calculate_subtotal, calculate_tax, calculate_discount, calculate_total.

**Defense 3 (caller/callee expectations):**
generate_invoice() -> create_charge() -> stripe_client.charge(). The Stripe client
documentation in stripe_client.py:142 comments: "Stripe uses floor rounding for partial
cents — match their behavior to avoid reconciliation mismatches."

**Defense 4 (would fix break something):**
Changing to ceil would create a mismatch between invoiced amounts and Stripe charges.
Every charge would be off by up to 1 cent, triggering reconciliation failures.

**Defense 5 (compensating code):**
N/A — the behavior is correct, not compensated.

**Conclusion:** Deliberate convention matching payment processor behavior. Changing it
would break financial reconciliation.
```

### Example: Escalated to human

```markdown
## INV-007: Welcome email feature-flagged to OFF by default

**Initially flagged as:** Bug (welcome email not sent on registration)
**Classification after investigation:** Needs human judgment (MEDIUM confidence)

**Defense 1 (business justification):**
Feature flags are commonly used to disable features during testing or staged rollouts.
This could be intentionally off for the current deployment stage.

**Defense 2 (systemic pattern):**
3 other feature flags exist in the codebase. 2 are ON by default, 1 (this one) is OFF.
No clear pattern.

**Defense 3 (caller/callee expectations):**
The registration endpoint checks the flag and skips the email call. The email function
itself works correctly when called.

**Defense 4 (would fix break something):**
Enabling the flag would send welcome emails to all new registrations. If the email
template or sender isn't configured, this could cause errors.

**Defense 5 (compensating code):**
No alternative welcome mechanism exists. New users get no onboarding communication.

**Conclusion:** Unclear whether this is a disabled feature or a bug. The flag suggests
intentionality, but no documentation explains why it's off. Escalating to human.
```
