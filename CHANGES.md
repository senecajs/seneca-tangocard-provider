# Changes

## 2.0.0 2026-11-21

First entry of this change log. Earlier versions are on npm and in the git
history.

* Seneca 4: the peer dependency is `seneca` `^4.0.0` (was `>=3`). Seneca 3
  users stay on `@seneca/tangocard-provider@1`.
* The entity peer is `@seneca/entity` `^29.0.0` instead of `seneca-entity`.
  The other peers are `@seneca/provider` `^5.0.0` and `@seneca/env` `^0.6.0`,
  which is now optional: the plugin itself does not use it.
* The `seneca-promisify` peer dependency is removed. Seneca 4 has promises
  built in; do not call `use('promisify')` (D4).
* Node.js 24 or later (`engines.node` `>=24`, was `>=14`).
* Tests load plugins by full name (`@seneca/entity`, `@seneca/env`,
  `@seneca/provider`). Without credentials they run against a local mock of
  the Tango Card RaaS API (set through the plugin option `url`), with dummy
  `TANGOCARD_*` values; with `test/local-config.js` or the four environment
  variables they call the integration API. New tests list customers and
  orders, and save an order (mock only), which also passes a documented
  `entity.order.save` default. Live calls were not tested on Seneca 4.
* devDependencies: `seneca` `^4.0.0`, `@seneca/entity` `^29.0.0`,
  `@seneca/env` `^0.6.0`, `@seneca/provider` `^5.0.0`, `seneca-msg-test`
  `^5.0.0`, `typescript` `^5.9.3` (with `module` `nodenext`) and
  `@types/node` `^24`; `seneca-entity`, `seneca-promisify` and `@seneca/doc`
  (with the disabled `doc` script) are removed.
* README: Seneca 4 install line, and a usage example with this provider's
  keys and entities. The note about an outdated SDK is removed: the plugin
  has no runtime dependencies.
* `repository.url` uses `git+https`, `publishConfig` sets public access, and
  the package includes `CHANGES.md`.
