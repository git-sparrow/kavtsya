# One app, two modes — not separate Customer and CafeOwner apps

Kavtsya ships as a single app with a CafeOwner Mode section, rather than two separate apps (e.g. "Kavtsya" + "Kavtsya for Business").

The industry pattern for two-sided platforms is separate apps (Uber/Uber Driver, Airbnb/Airbnb Host). We chose one app because in v1 the CafeOwner audience is small and the CafeOwner surface is minimal (scan QR, configure program, send push). Separate apps would double the build and maintenance cost with no UX benefit at this scale. CafeOwner Mode can be extracted into a standalone app later if the CafeOwner experience grows complex enough to justify it.
