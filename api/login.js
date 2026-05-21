// api/login.js
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { user, pass, name, ownerid, ver, sessionid, hwid } = req.body;

  const response = await fetch('https://keyauth.win/api/1.2/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'login',
      name: name || "Insanzoooooo7's Application",
      ownerid: ownerid || "QJT4rGUCIy",
      ver: ver || "1.0",
      user: user,
      pass: pass,
      sessionid: sessionid,
      hwid: hwid
    })
  });

  const data = await response.json();
  res.status(200).json(data);
}
