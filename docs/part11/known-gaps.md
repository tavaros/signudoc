# Known gaps

What Part 11 mode does not do yet, and what to do instead. These are also listed in the [risk assessment](risk-assessment.md).

| Gap                                                                                                                                     | Part 11   | What to do for now                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| **No password aging or reuse rules.** Passwords need 15 or more characters and are checked against breach lists, but they never expire. | 11.300(b) | Set a change interval in SOP-2 if your organization requires one.                                               |
| **No biometrics or passkeys.** Signing uses email and password.                                                                         | 11.200(b) | Not needed: email and password meet 11.200(a).                                                                  |
| **No signature meaning on templates.** A draft made from a template needs a meaning chosen for each signer before it can be sent.       | none      | The send is refused until each meaning is chosen, so nothing goes out without one.                              |
| **Full database access can rewrite the audit chain** consistently.                                                                      | 11.10(e)  | Limit database access, and file audit exports outside the database (SOP-5).                                     |
| **Signers outside your organization** need an account on your install, and an administrator must confirm who they are.                  | 11.100    | Fine for staff. For outside parties, decide whether this is workable or keep those records out of Part 11 mode. |

Suggestions and fixes are welcome on the project's GitHub.
