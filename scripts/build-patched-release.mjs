import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const REGION_BLOCK_MARKERS = ["抱歉您所在地区不可观看！", "版权地区受限", "AREA_LIMIT"];

export function selectConfiguredLocale(configuredLocales = [], availableLocales = []) {
	return configuredLocales.find(locale => availableLocales.includes(locale));
}

export function isBlockedPayloadText(body = "") {
	return REGION_BLOCK_MARKERS.some(message => body.includes(message));
}

function replaceExactlyOnce(source, search, replacement, label) {
	const first = source.indexOf(search);
	if (first === -1 || source.indexOf(search, first + search.length) !== -1) {
		throw new Error(`${label} anchor count must equal one`);
	}
	return source.replace(search, replacement);
}

export function patchRequestBundle(source) {
	const statusAnchor = 'switch(e?.headers?.["Grpc-Status"]??e?.headers?.["grpc-status"]){case"0":i=!0;break;case void 0:';
	const markers = JSON.stringify(REGION_BLOCK_MARKERS);
	const statusReplacement = `switch(e?.headers?.["Grpc-Status"]??e?.headers?.["grpc-status"]){case"0":try{const t=ag.decode(e?.body),n=ig.decode(t);i=!${markers}.some(e=>n.includes(e))}catch{i=(e?.body?.byteLength??e?.body?.length??0)>4096}break;case void 0:`;
	let patched = replaceExactlyOnce(source, statusAnchor, statusReplacement, "gRPC availability");
	patched = replaceExactlyOnce(patched, "r=a[Math.floor(Math.random()*a.length)]", "r=i.find(e=>a.includes(e))", "cached locale selection");
	patched = replaceExactlyOnce(patched, "const l=o[Math.floor(Math.random()*o.length)]", "const l=a.find(e=>o.includes(e))", "probe locale selection");
	return patched;
}

export function patchPlugin(source, tag) {
	const version = tag.replace(/^v/u, "");
	let patched = source.replace(/^#!version = .*$/mu, `#!version = ${version}`);
	patched = patched.replace(
		/^#!date = .*$/mu,
		`#!date = ${new Date()
			.toISOString()
			.replace("T", " ")
			.replace(/\.\d{3}Z$/u, " UTC")}`,
	);
	patched = patched.replaceAll("https://github.com/Biliverse/Global/releases/download/v0.9.3/request.bundle.js", `https://github.com/MorrisXDS/Global/releases/download/${tag}/request.bundle.js`);
	patched = patched.replaceAll("https://github.com/Biliverse/Global/releases/download/v0.9.3/response.bundle.js", `https://github.com/MorrisXDS/Global/releases/download/${tag}/response.bundle.js`);
	return patched;
}

function parseArguments(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) values[argv[index]] = argv[index + 1];
	for (const key of ["--plugin", "--request", "--response", "--out-dir", "--tag"]) {
		if (!values[key]) throw new Error(`missing ${key}`);
	}
	return values;
}

async function main() {
	const args = parseArguments(process.argv.slice(2));
	const outputDirectory = path.resolve(args["--out-dir"]);
	await mkdir(outputDirectory, { recursive: true });
	const requestBundle = patchRequestBundle(await readFile(args["--request"], "utf8"));
	const responseBundle = await readFile(args["--response"]);
	const plugin = patchPlugin(await readFile(args["--plugin"], "utf8"), args["--tag"]);
	const artifacts = new Map([
		["BiliBili.Global.plugin", Buffer.from(plugin)],
		["request.bundle.js", Buffer.from(requestBundle)],
		["response.bundle.js", responseBundle],
	]);
	const checksums = [];
	for (const [name, body] of artifacts) {
		await writeFile(path.join(outputDirectory, name), body);
		checksums.push(`${createHash("sha256").update(body).digest("hex")}  ${name}`);
	}
	await writeFile(path.join(outputDirectory, "SHA256SUMS"), `${checksums.join("\n")}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
	await main();
}
