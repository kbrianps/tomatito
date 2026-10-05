// Verificações do AAB de release (PLANO-ANDROID 7.4; A19).
//
//   node scripts/android/conferir-aab.mjs [<arquivo.aab>]
//
// 1. bundletool validate sem erro.
// 2. jarsigner -verify OK, e o SHA-256 do certificado igual ao da chave de
//    upload (keytool -list -v no upload.jks).
// 3. APK universal (bundletool build-apks --mode=universal): pacote, versão
//    (a do Cargo.toml; versionCode = maior*1000000 + menor*1000 + correção),
//    minSdk 24, targetSdk 37, rótulo "Tomatito" e as três ABIs.
// 4. Permissões: exatamente as da tabela 5.4 (sem INTERNET).
// 5. 16 KB: zipalign -c -P 16 no APK universal e os LOAD das três
//    libtomatito_lib.so em 0x4000.
// Imprime um JSON (com o SHA-256 do AAB) e sai 1 se algo falhou.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caminhoAab } from './instalar.mjs';
import { carregarAmbiente } from './lib/ambiente.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const env = carregarAmbiente();
const aab = process.argv[2] ?? caminhoAab(env);
const PASTA_DA_CHAVE = join(homedir(), '.config/tomatito/android');
const props = Object.fromEntries(readFileSync(join(PASTA_DA_CHAVE, 'keystore.properties'), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
const bt = join(env.ANDROID_HOME, 'build-tools', readdirSync(join(env.ANDROID_HOME, 'build-tools')).sort().at(-1));
const readelf = join(env.NDK_HOME, 'toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf');
const rodar = (cmd, args, opcoes = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 << 20, ...opcoes });

export const VERSION_CODE = (v) => { const [a, b, c] = v.split('.').map(Number); return a * 1_000_000 + b * 1000 + c; };
export const PERMISSOES = Object.freeze([
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
]);

// O keytool do Java 25 em pt-BR quebra ao imprimir o certificado
// (MissingFormatArgumentException na tradução): saída em inglês.
const EN = ['-J-Duser.language=en', '-J-Duser.country=US'];

const resultados = [];
const conferir = (nome, ok, detalhe) => resultados.push({ nome, ok: Boolean(ok), detalhe });
const versao = /^version = "([^"]+)"/m.exec(readFileSync(join(RAIZ, 'src-tauri/Cargo.toml'), 'utf8'))[1];
const sha256 = createHash('sha256').update(readFileSync(aab)).digest('hex');
const tmp = mkdtempSync('/opt/cargo-target/android/saidas/conferir-aab-');
try {
  const val = rodar('java', ['-jar', env.BUNDLETOOL, 'validate', `--bundle=${aab}`]);
  conferir('bundletool validate sem erro', val.status === 0, (val.stderr || '').slice(0, 300));

  const js = rodar('jarsigner', ['-verify', '-verbose', '-certs', aab]);
  const digital = (texto) => /SHA-?256:\s*([0-9A-F:]{95})/i.exec(texto)?.[1];
  const daChave = digital(rodar('keytool', [...EN, '-list', '-v', '-keystore', props.storeFile, '-storepass', props.password]).stdout);
  const doAab = digital(rodar('keytool', [...EN, '-printcert', '-jarfile', aab]).stdout);
  conferir('jarsigner -verify OK e o certificado é o da chave de upload', /jar verified/.test(js.stdout) && daChave && daChave === doAab, { verificado: /jar verified/.test(js.stdout), daChave, doAab });

  const apks = join(tmp, 'u.apks');
  const b = rodar('java', ['-jar', env.BUNDLETOOL, 'build-apks', `--bundle=${aab}`, `--output=${apks}`, '--mode=universal',
    `--ks=${props.storeFile}`, `--ks-pass=pass:${props.password}`, `--ks-key-alias=${props.keyAlias}`, `--key-pass=pass:${props.password}`]);
  if (b.status !== 0) throw new Error(`build-apks: ${b.stderr}`);
  execFileSync('unzip', ['-o', '-q', apks, 'universal.apk', '-d', tmp]);
  const apk = join(tmp, 'universal.apk');
  const badging = rodar(join(bt, 'aapt2'), ['dump', 'badging', apk]).stdout;
  const pego = (re) => re.exec(badging)?.[1];
  const m = {
    pacote: pego(/package: name='([^']+)'/), versionCode: pego(/versionCode='(\d+)'/), versionName: pego(/versionName='([^']+)'/),
    minSdk: pego(/(?:minS|s)dkVersion:'(\d+)'/), targetSdk: pego(/targetSdkVersion:'(\d+)'/), rotulo: pego(/application-label:'([^']+)'/),
    abis: (/native-code: (.*)/.exec(badging)?.[1] ?? '').replace(/'/g, '').trim().split(/\s+/).sort(),
  };
  conferir(
    `pacote io.github.kbrianps.tomatito, versão ${versao} (versionCode ${VERSION_CODE(versao)}), minSdk 24, targetSdk 37, rótulo Tomatito`,
    m.pacote === 'io.github.kbrianps.tomatito' && m.versionName === versao && Number(m.versionCode) === VERSION_CODE(versao) &&
      m.minSdk === '24' && m.targetSdk === '37' && m.rotulo === 'Tomatito',
    m,
  );
  conferir('as três ABIs: arm64-v8a, armeabi-v7a e x86_64', m.abis.join(' ') === 'arm64-v8a armeabi-v7a x86_64', m.abis);

  const perms = [...rodar(join(bt, 'aapt2'), ['dump', 'permissions', apk]).stdout.matchAll(/uses-permission: name='([^']+)'/g)]
    .map((x) => x[1]).filter((p) => p.startsWith('android.permission.')).sort();
  conferir('permissões: exatamente as da tabela 5.4, sem INTERNET', perms.join() === [...PERMISSOES].sort().join(), perms);

  const za = rodar(join(bt, 'zipalign'), ['-c', '-P', '16', '-v', '4', apk]);
  conferir('zipalign -c -P 16 no APK universal', za.status === 0, (za.stdout || '').split('\n').slice(-3).join(' '));
  execFileSync('unzip', ['-o', '-q', apk, 'lib/*', '-d', tmp]);
  const loads = Object.fromEntries(['arm64-v8a', 'armeabi-v7a', 'x86_64'].map((abi) => [abi,
    [...new Set(rodar(readelf, ['-lW', join(tmp, 'lib', abi, 'libtomatito_lib.so')]).stdout.split('\n').filter((l) => /^\s*LOAD/.test(l)).map((l) => l.trim().split(/\s+/).at(-1)))]]));
  conferir('16 KB: todos os LOAD das três libtomatito_lib.so em 0x4000', Object.values(loads).every((l) => l.length === 1 && l[0] === '0x4000'), loads);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const falhas = resultados.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: falhas.length === 0, aab, sha256, versao, versionCode: VERSION_CODE(versao), total: resultados.length, falhas: falhas.length, resultados }, null, 2));
process.exit(falhas.length ? 1 : 0);
