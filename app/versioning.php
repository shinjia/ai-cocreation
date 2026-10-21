<?php
// Version labels are metadata, never identifiers or floating-point numbers.
// Legacy snapshots keep their ids, contents, lineage and original ordinal.
function versionCoordinates($version) {
    $major=field($version,'major');$minor=field($version,'minor');
    if(is_int($major)&&$major>0&&is_int($minor)&&$minor>=0)return array('major'=>$major,'minor'=>$minor);
    $number=field($version,'number',1);return array('major'=>is_int($number)&&$number>0?$number:1,'minor'=>0);
}
function versionLabel($version) { $n=versionCoordinates($version);return 'V'.$n['major'].($n['minor']>0?'.'.$n['minor']:''); }
function normalizeItemVersions(&$item) {
    $reserved=array();$keep=array();$maxMajor=0;
    foreach($item['versions'] as $i=>$v){
        $major=field($v,'major');$minor=field($v,'minor');$legacy=field($v,'number',0);
        if(is_int($legacy)&&$legacy>0)$maxMajor=max($maxMajor,$legacy);
        if(is_int($major)&&$major>0&&is_int($minor)&&$minor>=0){$key=$major.':'.$minor;$maxMajor=max($maxMajor,$major);if(!isset($reserved[$key])){$reserved[$key]=true;$keep[$i]=true;}}
    }
    $ids=array();
    foreach($item['versions'] as $i=>&$v){
        $ids[]=$v['id'];if(isset($keep[$i]))continue;
        $n=versionCoordinates($v);$key=$n['major'].':'.$n['minor'];
        if(isset($reserved[$key])){$n=array('major'=>++$maxMajor,'minor'=>0);$key=$n['major'].':0';}
        $reserved[$key]=true;$v['major']=$n['major'];$v['minor']=$n['minor'];
    }unset($v);
    $archived=field($item,'archivedVersionIds',array());if(!is_array($archived))$archived=array();
    $official=field($item,'officialVersionId');$item['archivedVersionIds']=array_values(array_unique(array_filter($archived,function($id)use($ids,$official){return is_string($id)&&in_array($id,$ids,true)&&$id!==$official;}),SORT_STRING));
}
function nextVersionCoordinates($versions,$mode,$base=null) {
    ensure(in_array($mode,array('major','minor'),true),'VERSION_MODE','請選擇另存新版本或另存小修改。');
    $major=0;$minor=0;
    if($mode==='minor'){ensure(is_array($base),'VERSION_BASE_REQUIRED','請先選擇要小修改的來源版本。');$major=versionCoordinates($base)['major'];}
    foreach($versions as $v){$n=versionCoordinates($v);if($mode==='major')$major=max($major,$n['major']);elseif($n['major']===$major)$minor=max($minor,$n['minor']);}
    return $mode==='major'?array('major'=>$major+1,'minor'=>0):array('major'=>$major,'minor'=>$minor+1);
}
function versionArchived($item,$id) { return in_array($id,field($item,'archivedVersionIds',array()),true); }
function versionGoalText($version) {
    $text=field($version,'goalText');if(is_string($text))return $text;
    $text=field(field($version,'goalSnapshot',array()),'summary','');return is_string($text)?$text:'';
}
// The combined note is authoritative when present. Legacy fields stay intact;
// composing this view never rewrites old snapshots or duplicates equal values.
function versionGoalAndRationale($version) {
    $combined=field($version,'goalAndRationale');if(is_string($combined))return $combined;
    $parts=array();$seen=array();
    foreach(array(array('本版目標：',versionGoalText($version)),array('討論與變更摘要：',field($version,'changeSummary','')),array('修改意見：',field($version,'rationale',''))) as $entry){
        $value=$entry[1];if(!is_string($value)||trim($value)===''||in_array($value,$seen,true))continue;
        $seen[]=$value;$parts[]=$entry[0]."\n".$value;
    }
    return implode("\n\n",$parts);
}
function validateCombinedVersionNote($value) {
    userTextValue($value,12000,'本版目標與修改意見');
    ensure(strlen($value)<=12000,'INVALID_INPUT','本版目標與修改意見過長。');
    return $value; // Keep deliberate whitespace; validation must not rewrite notes.
}
function versionHasCombinedOverride($version) {
    $combined=field($version,'goalAndRationale');if(!is_string($combined))return false;
    unset($version['goalAndRationale']);return $combined!==versionGoalAndRationale($version);
}
function versionComparisonSnapshot($version) {
    return array('versionId'=>$version['id'],'goalSnapshot'=>field($version,'goalSnapshot'),'goalText'=>field($version,'goalText'),'goalSource'=>field($version,'goalSource'),'goalAndRationale'=>field($version,'goalAndRationale'),'changeSummary'=>field($version,'changeSummary'),'rationale'=>field($version,'rationale'),'discussionMessageIds'=>field($version,'discussionMessageIds'));
}
