import { isTrustedMutationRequest,jsonError,requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TYPES=new Set(["image/jpeg","image/png","image/webp"]);const MAX_BYTES=2*1024*1024;
function matchesMagic(bytes:Uint8Array,type:string){if(type==="image/png")return bytes.length>8&&bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]);if(type==="image/jpeg")return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9;if(type==="image/webp")return bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";return false;}
export async function POST(request:Request){
  if(!isTrustedMutationRequest(request))return jsonError("Cross-origin QR uploads are not allowed.",403);
  const actor=await requireActor(request,["owner"]);if(!actor?.propertyId)return jsonError("Active property-owner access is required.",401);
  const form=await request.formData();const upload=form.get("file");if(!(upload instanceof File))return jsonError("Choose a UPI QR image.");
  if(!TYPES.has(upload.type)||upload.size<=0||upload.size>MAX_BYTES)return jsonError("UPI QR must be PNG, JPEG, or WebP and smaller than 2 MB.");
  const bytes=new Uint8Array(await upload.arrayBuffer());if(!matchesMagic(bytes,upload.type))return jsonError("The selected file is not a valid image.");
  const extension=upload.type==="image/png"?"png":upload.type==="image/webp"?"webp":"jpg";const objectKey=`organizations/${actor.organizationId}/upi-qr/${crypto.randomUUID()}.${extension}`;
  const{error}=await getSupabaseAdmin().storage.from("upi-qr-assets").upload(objectKey,bytes,{contentType:upload.type,upsert:false,metadata:{organizationId:actor.organizationId,propertyId:actor.propertyId,uploadedBy:actor.id}});
  if(error)return jsonError("UPI QR could not be stored.",503);
  return Response.json({objectKey,contentType:upload.type,size:upload.size},{status:201,headers:{"cache-control":"no-store"}});
}
