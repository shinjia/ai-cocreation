<?php
// A mindmap has an accepted tree and a separate, explicitly unaccepted queue.
// Shared artifact helpers perform exact-shape, UTF8, byte and secret checks.
function validateMindmapArtifact($value) {
    artifactObject($value,array('kind','rootId','nodes','proposals'),'心智圖');
    ensure($value['kind']==='mindmap','ARTIFACT_INVALID','心智圖類型欄位不正確。');
    $rootId=artifactStableId($value['rootId'],'心智圖根節點識別碼');
    artifactList($value['nodes'],1,80,'心智圖已加入節點');
    artifactList($value['proposals'],0,24,'心智圖待選分支');
    $nodes=array();$proposals=array();$ids=array();$byId=array();$roots=array();
    foreach($value['nodes'] as $node){
        artifactObject($node,array('id','parentId','label','description'),'心智圖節點');
        $id=artifactStableId($node['id'],'心智圖節點識別碼');
        ensure(!in_array($id,$ids,true),'ARTIFACT_INVALID','心智圖節點與待選分支識別碼不可重複。');$ids[]=$id;
        $parentId=$node['parentId'];
        if($parentId==='')$roots[]=$id;else artifactStableId($parentId,'心智圖父節點識別碼');
        $entry=array('id'=>$id,'parentId'=>$parentId,'label'=>artifactText($node['label'],240,'心智圖節點名稱',false),'description'=>artifactText($node['description'],2000,'心智圖節點說明'));
        $nodes[]=$entry;$byId[$id]=$entry;
    }
    ensure($roots===array($rootId),'ARTIFACT_INVALID','心智圖必須恰有一個與 rootId 相符的根節點。');
    foreach($nodes as $node){
        // Walking to the sole root proves both connectivity and acyclicity,
        // including disconnected cycles, without relying on list order.
        $cursor=$node['id'];$seen=array();
        while($cursor!==$rootId){
            ensure(isset($byId[$cursor])&&!in_array($cursor,$seen,true),'ARTIFACT_INVALID','心智圖不可有循環、孤立節點或不存在的父節點。');
            $seen[]=$cursor;$cursor=$byId[$cursor]['parentId'];
        }
    }
    foreach($value['proposals'] as $proposal){
        artifactObject($proposal,array('id','parentId','label','description'),'心智圖待選分支');
        $id=artifactStableId($proposal['id'],'待選分支識別碼');
        ensure(!in_array($id,$ids,true),'ARTIFACT_INVALID','心智圖節點與待選分支識別碼不可重複。');$ids[]=$id;
        $parentId=artifactStableId($proposal['parentId'],'待選分支父節點識別碼');
        ensure(isset($byId[$parentId]),'ARTIFACT_INVALID','待選分支只能屬於已加入心智圖的節點，不能屬於另一個待選分支。');
        $proposals[]=array('id'=>$id,'parentId'=>$parentId,'label'=>artifactText($proposal['label'],240,'待選分支名稱',false),'description'=>artifactText($proposal['description'],2000,'待選分支說明'));
    }
    $out=array('kind'=>'mindmap','rootId'=>$rootId,'nodes'=>$nodes,'proposals'=>$proposals);
    ensure(strlen(jsonEncode($out))<=60000,'ARTIFACT_INVALID','完整心智圖超過60000個 UTF8 位元組，未保存且未截斷內容。');
    ensure(strlen(mindmapOutlineContent($out))<=60000,'ARTIFACT_INVALID','完整心智圖文字投影超過保存上限，未截斷內容。');
    return $out;
}
function mindmapSchema() {
    $text=array('type'=>'string');
    $node=artifactSchemaObject(array('id'=>$text,'parentId'=>$text,'label'=>$text,'description'=>$text));
    return artifactSchemaObject(array('kind'=>array('type'=>'string','enum'=>array('mindmap')),'rootId'=>$text,
        'nodes'=>array('type'=>'array','minItems'=>1,'maxItems'=>80,'items'=>$node),
        'proposals'=>array('type'=>'array','minItems'=>0,'maxItems'=>24,'items'=>$node)));
}
function mindmapNode($artifact,$id) {
    foreach($artifact['nodes'] as $node)if($node['id']===$id)return $node;
    return null;
}
function mindmapNodesEqual($a,$b) {
    // Call with validated canonical node lists. Order is part of the snapshot.
    return $a===$b;
}
function mindmapOutlineContent($artifact) {
    // Internal projection of an already validated tree. The validator uses
    // this directly so every valid artifact can produce complete legacy items.
    $children=array();
    foreach($artifact['nodes'] as $node){$parent=$node['parentId'];if(!isset($children[$parent]))$children[$parent]=array();$children[$parent][]=$node;}
    $lines=array('已加入心智圖：');
    $walk=function($parentId,$depth)use(&$walk,&$lines,$children){
        foreach(isset($children[$parentId])?$children[$parentId]:array() as $node){
            $indent=str_repeat('  ',$depth);$lines[]=$indent.'- ['.$node['id'].'] '.$node['label'];
            if($node['description']!=='')$lines[]=$indent.'  說明：'.$node['description'];
            $walk($node['id'],$depth+1);
        }
    };
    $walk('',0);$lines[]='';$lines[]='待選分支（尚未加入心智圖）：';
    foreach($artifact['proposals'] as $proposal){
        $lines[]='- ['.$proposal['id'].'] '.$proposal['label'].'（父節點：'.$proposal['parentId'].'）';
        if($proposal['description']!=='')$lines[]='  說明：'.$proposal['description'];
    }
    if($artifact['proposals']===array())$lines[]='（無）';
    return implode("\n",$lines);
}
function mindmapItems($value) {
    $artifact=validateMindmapArtifact($value);$content=mindmapOutlineContent($artifact);
    ensure(strlen($content)<=60000,'ARTIFACT_INVALID','完整心智圖文字投影超過保存上限，未截斷內容。');
    return array(array('id'=>'document','label'=>'心智圖來源','content'=>$content));
}
