import { uploadError } from "@/lib/uploads/http";

export async function POST() {
  return uploadError("UPLOAD_API_RETIRED", 410);
}
