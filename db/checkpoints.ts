import { env } from "cloudflare:workers";
export type CampaignCheckpoint={id:string;name:string;day:number;minutes:number;createdAt:string;revision:number;safety:boolean};
let ready:Promise<void>|null=null;
async function database(){
 if(!env.DB)throw new Error("Registro indisponível.");
 const db=env.DB;
 ready??=db.prepare(`CREATE TABLE IF NOT EXISTS campaign_checkpoints (
 campaign_id text NOT NULL, id text NOT NULL, name text NOT NULL, body text NOT NULL,
 revision integer NOT NULL, created_at text NOT NULL, safety integer NOT NULL DEFAULT 0,
 PRIMARY KEY(campaign_id,id))`).run().then(()=>undefined).catch(e=>{ready=null;throw e;});
 await ready;return db;
}
export async function listCheckpoints(campaignId:string):Promise<CampaignCheckpoint[]>{
 const db=await database();const result=await db.prepare(`SELECT id,name,json_extract(body,'$.day') AS day,json_extract(body,'$.minutes') AS minutes,created_at AS createdAt,revision,safety FROM campaign_checkpoints WHERE campaign_id=? ORDER BY created_at DESC,id`).bind(campaignId).all<CampaignCheckpoint>();
 return result.results.map(r=>({...r,safety:Boolean(r.safety)}));
}
export async function saveCheckpoint(campaignId:string,id:string,name:string,revision:number){
 const db=await database();
 const result=await db.prepare(`INSERT OR IGNORE INTO campaign_checkpoints(campaign_id,id,name,body,revision,created_at,safety)
 SELECT owner_id,?, ?,body,revision,?,0 FROM campaign_states WHERE owner_id=? AND revision=? AND
 (SELECT count(*) FROM campaign_checkpoints WHERE campaign_id=? AND safety=0)<10`)
 .bind(id,name,new Date().toISOString(),campaignId,revision,campaignId).run();
 return Boolean(result.meta.changes);
}
export async function readCheckpoint(campaignId:string,id:string){return (await database()).prepare("SELECT body,name FROM campaign_checkpoints WHERE campaign_id=? AND id=?").bind(campaignId,id).first<{body:string;name:string}>();}
export async function deleteCheckpoint(campaignId:string,id:string){const result=await (await database()).prepare("DELETE FROM campaign_checkpoints WHERE campaign_id=? AND id=?").bind(campaignId,id).run();return Boolean(result.meta.changes);}
