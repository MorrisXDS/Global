import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedPayloadText, patchPlugin, patchRequestBundle, REGION_BLOCK_MARKERS, selectConfiguredLocale } from "../scripts/build-patched-release.mjs";

test("rejects every known regional block marker", () => {
	for (const marker of REGION_BLOCK_MARKERS) assert.equal(isBlockedPayloadText(`prefix ${marker} suffix`), true);
	assert.equal(isBlockedPayloadText("playable response"), false);
});

test("selects the first configured locale regardless of probe completion order", () => {
	const configured = ["CHN", "HKG", "TWN"];
	assert.equal(selectConfiguredLocale(configured, ["TWN", "HKG"]), "HKG");
	assert.equal(selectConfiguredLocale(configured, ["HKG", "TWN"]), "HKG");
	assert.equal(selectConfiguredLocale(configured, []), undefined);
});

test("patches the three release anchors exactly once", () => {
	const fixture = 'switch(e?.headers?.["Grpc-Status"]??e?.headers?.["grpc-status"]){case"0":i=!0;break;case void 0:r=a[Math.floor(Math.random()*a.length)];const l=o[Math.floor(Math.random()*o.length)]';
	const patched = patchRequestBundle(fixture);
	assert.match(patched, /ag\.decode/u);
	assert.match(patched, /r=i\.find/u);
	assert.match(patched, /const l=a\.find/u);
	assert.throws(() => patchRequestBundle(`${fixture}${fixture}`), /anchor count must equal one/u);
});

test("pins patched request and response bundles to the fork release", () => {
	const plugin = ["#!date = old", "#!version = 0.9.3", "https://github.com/Biliverse/Global/releases/download/v0.9.3/request.bundle.js", "https://github.com/Biliverse/Global/releases/download/v0.9.3/response.bundle.js"].join("\n");
	const patched = patchPlugin(plugin, "v0.9.3-morris.1");
	assert.match(patched, /#!version = 0\.9\.3-morris\.1/u);
	assert.match(patched, /MorrisXDS\/Global\/releases\/download\/v0\.9\.3-morris\.1\/request\.bundle\.js/u);
	assert.match(patched, /MorrisXDS\/Global\/releases\/download\/v0\.9\.3-morris\.1\/response\.bundle\.js/u);
});
