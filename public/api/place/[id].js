export default function handler(req, res) {                                   
    res.setHeader('Content-Type', 'text/html');                                 
    res.send(`<!DOCTYPE html>
  <html>                                                                        
  <head>                                                    
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Suna — Discover Places</title> 
    <style>
      body { margin: 0; background: #111; color: white; font-family:            
  -apple-system, sans-serif;                  
             display: flex; flex-direction: column; align-items: center;        
  justify-content: center;                                  
             min-height: 100vh; text-align: center; padding: 24px; box-sizing:  
  border-box; }                               
      p { color: #aaa; margin-bottom: 32px; }                                   
      a { background: #FFD76A; color: black; padding: 14px 32px; border-radius: 
  50px;                                                                         
          text-decoration: none; font-weight: 700; font-size: 16px; display: 
  inline-block; }                                                               
    </style>                                                
  </head>                                                                       
  <body> 
    <h1>✨ Discover this place on Suna</h1>                                     
    <p>Get the free app to see the full experience</p>      
    <a href="https://apps.apple.com/app/id6759053765">Download Suna — Free</a>
  </body>                                                                     
  </html>`);                                  
  }
