# Scam patterns

Open Knowledge Format (OKF v0.2) bundle. Each concept is one scam pattern that SHIELD-P001 can
detect; the `rules` field names the policy rules that fire on it. Scam Shield attaches the
matching concepts to every verdict, with their sources and trust tier, so a person (or another
agent) can see what the verdict rests on.

Trust tiers come from `verified` (OKF §5.3): none is *unverified*, a `process:` or agent actor is
*machine-confirmed*, a `human:` actor is *human-reviewed*. A reviewer promotes a concept by
adding `{ by: human:<id>, at: <ISO time> }` to its `verified` list.

# Policy

- [SHIELD-P001](policy-shield-p001.md): the rules that turn red flags into a verdict

# Patterns

- [Guaranteed returns](guaranteed-returns.md): a fixed, high return with "no risk"
- [Unlicensed investment offer](unlicensed-entity.md): money taken by an entity no regulator lists
- [Payment to a personal account](personal-account-payment.md): investment money sent to an individual or a crypto wallet
- [Known scam script](known-scam-script.md): wording that matches a recorded scam message
- [Newly registered website](new-domain.md): a link to a domain only days old, or a lookalike
- [Impersonating a bank or regulator](authority-impersonation.md): borrowing an institution's name
- [False urgency](false-urgency.md): countdowns and "last slots" to stop people checking
