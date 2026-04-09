/**                                                                                                                                                                                                                                                                                               
   * GitHub webhook signature validator — SPIKE-04.                                                                                                                                                                                                                                                 
   *                                                                                                                                                                                                                                                                                              
   * Validates X-Hub-Signature-256 header using HMAC-SHA256 and timing-safe comparison.
   */                                                                                                                                                                                                                                                                                               
  
  import { createHmac, timingSafeEqual } from "node:crypto"                                                                                                                                                                                                                                         
                                                                                                                                                                                                                                                                                                  
  export function validateGitHubWebhook(
    body: string,
    signature: string,
    secret: string,
  ): boolean {                                                                                                                                                                                                                                                                                      
    const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
                                                                                                                                                                                                                                                                                                    
    if (signature.length !== expected.length) {                                                                                                                                                                                                                                                   
      return false
    }

    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))                                                                                                                                                                                                                           
  }