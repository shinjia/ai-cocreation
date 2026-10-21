<?php
// Member records are an allowlisted, non-secret roster, never a credential store.
function validateMemberRosterInput($members,$activeMemberId,$usageConsent) {
    ensure(is_array($members)&&count($members)<=20&&($members===array()||array_keys($members)===range(0,count($members)-1)),'MEMBERS_INVALID','AI 成員清單必須是最多 20 位成員的陣列。');
    ensure(is_bool($usageConsent),'CONSENT_REQUIRED','請明確勾選或取消 AI 使用同意。');
    $out=array();$ids=array();$nicknames=array();$activeFound=$activeMemberId===null;
    if($activeMemberId!==null)ensure(is_string($activeMemberId)&&preg_match('/^[a-f0-9]{32}$/D',$activeMemberId),'MEMBER_INVALID','AI 成員識別碼不正確。');
    foreach($members as $member) {
        ensure(is_array($member)&&count($member)===6,'MEMBER_FIELDS_INVALID','AI 成員只能包含識別碼、稱呼、啟用狀態、服務、模型與本機網址，不可包含金鑰或其他欄位。');
        foreach(array('id','nickname','enabled','provider','model','ollamaUrl') as $key)ensure(array_key_exists($key,$member),'MEMBER_FIELDS_INVALID','AI 成員欄位不完整或含有不允許的欄位。');
        $id=$member['id'];ensure(is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id),'MEMBER_INVALID','AI 成員識別碼不正確。');
        $nickname=userTextValue($member['nickname'],120,'AI 成員稱呼');
        ensure(!in_array($id,$ids,true)&&!in_array($nickname,$nicknames,true),'MEMBER_DUPLICATE','AI 成員的識別碼與稱呼不可重複。');
        ensure(is_bool($member['enabled']),'MEMBER_INVALID','AI 成員啟用狀態必須明確勾選或取消。');
        $connection=validateConnection($member);
        $out[]=array('id'=>$id,'nickname'=>$nickname,'enabled'=>$member['enabled'],'provider'=>$connection['provider'],'model'=>$connection['model'],'ollamaUrl'=>$connection['ollamaUrl']);
        $ids[]=$id;$nicknames[]=$nickname;
        if($id===$activeMemberId){ensure($member['enabled'],'MEMBER_DISABLED','所選的 AI 成員未啟用，請另選已勾選的成員或清除選擇。');$activeFound=true;}
    }
    ensure($activeFound,'MEMBER_NOT_FOUND','找不到所選的 AI 成員，請重新選擇。',409);
    return array('members'=>$out,'activeMemberId'=>$activeMemberId,'usageConsent'=>$usageConsent);
}

function validateStoredMemberRoster($record) {
    ensure(is_array($record)&&count($record)===5,'INVALID_SETTINGS','AI 成員設定無法驗證，請重新保存設定。',500);
    foreach(array('members','activeMemberId','settingsRevision','usageConsent','consentAt') as $key)ensure(array_key_exists($key,$record),'INVALID_SETTINGS','AI 成員設定欄位不完整。',500);
    $out=validateMemberRosterInput($record['members'],$record['activeMemberId'],$record['usageConsent']);
    ensure(is_string($record['settingsRevision'])&&preg_match('/^[a-f0-9]{64}$/D',$record['settingsRevision']),'INVALID_SETTINGS','AI 成員設定版本無法驗證。',500);
    $consentAt=$record['consentAt'];
    ensure($out['usageConsent']?(is_string($consentAt)&&preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/D',$consentAt)&&strtotime($consentAt)!==false):$consentAt===null,'INVALID_SETTINGS','AI 使用同意紀錄無法驗證。',500);
    return array('members'=>$out['members'],'activeMemberId'=>$out['activeMemberId'],'settingsRevision'=>$record['settingsRevision'],'usageConsent'=>$out['usageConsent'],'consentAt'=>$consentAt);
}
