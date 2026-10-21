<?php
/** Same-project immutable image pins for native text/image layouts.
 * Model-returned metadata is never an authorization grant. No pixels are sent
 * to the model here; the private store read verifies the persisted asset only.
 */
trait CocreationCompositionActions {
    private function isComposition($p) { return in_array(field($p,'module'),array('illustrated','poster'),true); }
    private function compositionReferencePool($p,$sources=array()) {
        if(!$this->isComposition($p))return array();
        $groups=array();foreach($sources as $source)$groups[]=field($source,'referencesSnapshot',array());$groups[]=$p['references'];
        $out=array();$byId=array();$verified=array();
        foreach($groups as $group){
            ensure(is_array($group)&&($group===array()||array_keys($group)===range(0,count($group)-1)),'COMPOSITION_REFERENCE_INVALID','固定引用清單格式不正確，未使用來源或呼叫 AI。',409);
            foreach($group as $ref){
                $id=field($ref,'id');$snapshot=field($ref,'versionSnapshot');
                ensure(is_array($ref)&&is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)&&field($ref,'projectId')===$p['id']&&is_array($snapshot),'COMPOSITION_REFERENCE_INVALID','固定引用必須來自目前專案的完整版本快照。',409);
                foreach(array('targetItemId','versionId') as $key)ensure(is_string(field($ref,$key))&&preg_match('/^[a-f0-9]{32}$/D',$ref[$key]),'COMPOSITION_REFERENCE_INVALID','固定引用的來源識別碼不正確。',409);
                ensure(field($snapshot,'id')===$ref['versionId'],'COMPOSITION_REFERENCE_INVALID','固定引用版本與快照不一致。',409);
                if(isset($byId[$id])){
                    $prior=$out[$byId[$id]];ensure($prior['targetItemId']===$ref['targetItemId']&&$prior['versionId']===$ref['versionId']&&jsonEncode($prior['versionSnapshot'])===jsonEncode($snapshot),'COMPOSITION_REFERENCE_CONFLICT','同一引用對應不同版本快照，未替換圖片或呼叫 AI。',409);continue;
                }
                $target=$p['creativeItems'][$this->locateItem($p,$ref['targetItemId'])];$saved=$this->version($target,$ref['versionId']);
                ensure(field($snapshot,'contentType',$target['type'])===field($saved,'contentType',$target['type']),'COMPOSITION_REFERENCE_INVALID','固定引用的作品類型與已保存版本不一致。',409);
                if(field($saved,'contentType')==='image'){
                    $artifact=validateImageArtifact(field($snapshot,'artifact'));$stored=validateImageArtifact(field($saved,'artifact'));
                    ensure($artifact===$stored,'COMPOSITION_REFERENCE_INVALID','圖片引用與已保存的固定版本不一致，未改用其他圖片。',409);
                    $key=$target['id'].':'.$stored['asset']['id'].':'.$stored['asset']['sha256'];
                    if(!isset($verified[$key])){$record=$this->resolveImageAsset($p,$target['id'],$stored);unset($record);$verified[$key]=true;}
                }
                ensure(count($out)<256,'CONTEXT_LIMIT','固定引用超過安全上限，未截斷或呼叫 AI。',409);$byId[$id]=count($out);$out[]=$ref;
            }
        }
        foreach($sources as $source){
            ensure(field($source,'contentType')===$p['module'],'COMPOSITION_REFERENCE_INVALID','選取來源不是目前創作類型，未呼叫 AI。',409);
            $artifact=validateCompositionArtifact(field($source,'artifact'),$p['module']);$this->compositionUsedReferences($artifact,$out);
        }
        return $out;
    }
    private function compositionUsedReferences($artifact,$pool) {
        $map=array();foreach($pool as $ref)$map[$ref['id']]=$ref;$used=array();$seen=array();
        foreach($artifact['blocks'] as $block){$id=$block['imageRefId'];if($id==='')continue;
            ensure(isset($map[$id])&&field($map[$id]['versionSnapshot'],'contentType')==='image','COMPOSITION_REFERENCE_MISSING','創作內容使用的固定圖片引用缺漏，未保存作品，也不會自行換圖。',409);
            if(!isset($seen[$id])){$used[]=$map[$id];$seen[$id]=true;}
        }
        return $used;
    }
    private function compositionSnapshotReferences($p,$artifact,$pool) {
        // Preserve current context plus historical pins actually used by this
        // result. Unused ancestors do not accumulate into every new snapshot.
        $out=$p['references'];$ids=array_column($out,'id');
        foreach($this->compositionUsedReferences($artifact,$pool) as $ref)if(!in_array($ref['id'],$ids,true)){$out[]=$ref;$ids[]=$ref['id'];}
        return $out;
    }
}
