// Source contracts, not PHP execution. Native fixture is tests/image-actions.php.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const actions=source('app/image-actions.php'),route=source('public/media.php'),app=source('app/app.php');
test('upload decode happens before writer lock; receipt, asset, full project and receipt commit together',()=>{
 const body=actions.split('public function uploadImage(')[1].split('private function prepareImageInputs')[0];
 assert.ok(body.indexOf('normalizeUploadedPng($bytes)')<body.indexOf('$media->transaction'));
 const transaction=body.split('$media->transaction')[1];
 assert.ok(transaction.indexOf('lookupReceipt')<transaction.indexOf('$this->revision'));
 assert.ok(transaction.indexOf('$this->revision')<transaction.indexOf('$store->insert'));
 assert.ok(transaction.indexOf('$store->insert')<transaction.indexOf('$this->appendVersion'));
 assert.ok(transaction.indexOf('$this->appendVersion')<transaction.indexOf('$this->save($p)'));
 assert.ok(transaction.indexOf('$this->save($p)')<transaction.indexOf('recordReceipt'));
 assert.match(transaction,/hash_equals\(\$receipt\['fingerprint'\],\$fingerprint\)/);
 assert.match(transaction,/'replayed'=>true/);assert.doesNotMatch(transaction,/->generate\(|->requestStart\(|->get\(\$this->owner\)/);
});
test('read resolves owned project and exact saved item/version before private asset access',()=>{
 const read=actions.split('public function readImageVersion(')[1].split('public function uploadImage')[0];
 assert.match(read,/store->project\(field\(\$input,'id'\),\$this->owner\)/);
 assert.match(read,/locateItem\(\$raw,field\(\$input,'itemId'\)\)/);assert.match(read,/version\(\$item,field\(\$input,'versionId'\)\)/);
 assert.doesNotMatch(read,/field\(\$input,'assetId'\)/);assert.match(actions,/read\(\$this->owner,\$p\['id'\],\$artifact\['asset'\]\['id'\],\$itemId\)/);
 assert.match(actions,/imageAssetDescriptor\(\$record\['metadata'\]\)===\$artifact\['asset'\]/);
});
test('media endpoint enforces POST Origin CSRF host session and bounded uploaded file before reading',()=>{
 assert.match(route,/startAppSession\(\$config\)/);assert.match(route,/REQUEST_METHOD'\]===\s*'POST'/);assert.match(route,/HTTP_ORIGIN'\]===\$config\['origin'\]/);
 assert.match(route,/hash_equals\(\$_SESSION\['csrf'\],\$_SERVER\['HTTP_X_CSRF_TOKEN'\]\)/);assert.match(route,/is_uploaded_file\(\$file\['tmp_name'\]\)/);
 assert.match(route,/file_get_contents\(\$file\['tmp_name'\],false,null,0,4194305\)/);assert.match(route,/4325376/);assert.match(route,/Cross-Origin-Resource-Policy: same-origin/);
 assert.doesNotMatch(route,/\$_GET|file_get_contents\(\$input|move_uploaded_file|\['name'\]|\['type'\]/);
 assert.match(source('public/api.php'),/1048577/); // Existing JSON endpoint has not been enlarged.
});
test('image analysis opt-in binds exact fixed configuration without reading key or calling provider',()=>{
 const grant=actions.split('private function grantImageAnalysis(')[1].split('private function imageAssetDescriptor')[0];
 assert.match(grant,/projectConnection\(\$p\)/);assert.match(grant,/'bindingHash'=>\$this->imageBindingHash\(\$p\)/);
 assert.doesNotMatch(grant,/->generate|->adapter|->checkApproval|->vault/);assert.match(actions,/field\(\$consent,'bindingHash'\)===\$this->imageBindingHash\(\$p\)/);
 assert.match(app,/if\(\$action==='grant_image_analysis'\)return \$this->grantImageAnalysis\(\$input\)/);
});
test('image analysis uses saved bytes with size caps and immutable version provenance only',()=>{
 const prepare=actions.split('private function prepareImageInputs(')[1];assert.match(prepare,/count\(\$images\)<5/);assert.match(prepare,/12582912/);
 assert.match(prepare,/resolveImageAsset\(\$p,\$itemId,\$version\['artifact'\]\)/);assert.match(prepare,/imageConsentRequired\(\$p\)/);
 assert.match(prepare,/setImageInputs\(\$images\)/);assert.match(app,/\['inputMode'\]='image_bytes'/);assert.match(app,/\['imageInputs'\]=\$this->imageInputSnapshots/);
 assert.match(app,/prepareImageInputs\(\$p,\$module,\$versions,false\)/);assert.match(app,/IMAGE_GENERATION_UNAVAILABLE/);
 assert.doesNotMatch(actions,/base64_encode|curl_|https?:\/\//);
});
test('image snapshots validate privately owned bytes; all old module dispatch paths remain',()=>{
 assert.match(app,/if\(\$p\['module'\]==='image'\)\{\$this->resolveImageAsset\(\$p,\$p\['activeItemId'\],\$artifact\)/);
 assert.match(app,/\$artifact\['asset'\]===\$base\['artifact'\]\['asset'\]/);
 assert.match(source('app/modules.php'),/if\(\$id==='image'\)return new ImageModule/);
 assert.match(source('app/artifacts.php'),/if\(\$type==='image'\)return imageArtifactSchema/);
 assert.match(source('app/bootstrap.php'),/image-actions.php/);
});
