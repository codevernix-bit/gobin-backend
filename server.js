require("dotenv").config()

const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const express = require("express")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const cors = require("cors")
const nodemailer = require("nodemailer")
const axios = require("axios")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const app = express()

// =========================
// UPLOAD ATTACHMENT
// =========================

const uploadDir = path.join(__dirname, "uploads")

if(!fs.existsSync(uploadDir)){
  fs.mkdirSync(uploadDir)
}

app.use("/uploads", express.static(uploadDir))

const storage = multer.diskStorage({
  destination:(req,file,cb)=>{
    cb(null, uploadDir)
  },

  filename:(req,file,cb)=>{
    const unique = Date.now() + "-" + Math.round(Math.random()*1E9)
    cb(null, unique + "-" + file.originalname)
  }
})

const upload = multer({
  storage,
  limits:{
    fileSize: 10 * 1024 * 1024
  }
})

app.use(cors({ origin: "*" }))
app.use(express.json())

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BinMail API Running"
  })
})

/* =========================
   SMTP CONFIG
========================= */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000
})

function isExternalEmail(email){
  return !String(email || "").toLowerCase().endsWith("@gobin.id")
}

/* =========================
   SCHEMAS
========================= */

const userSchema = new mongoose.Schema({
  username:{ type:String, required:true, unique:true },
  email:{ type:String, required:true, unique:true },
  password:{ type:String, required:true },
  createdAt:{ type:Date, default:Date.now }
})

const User = mongoose.model("User", userSchema)

const emailSchema = new mongoose.Schema({
  from:{ type:String, required:true },
  to:{ type:String, default:"" },
  subject:{ type:String, default:"No Subject" },
  message:{ type:String, default:"" },
  folder:{ type:String, default:"inbox" },
  read:{ type:Boolean, default:false },
  starred:{ type:Boolean, default:false },
  trash:{ type:Boolean, default:false },
  external:{ type:Boolean, default:false },
  gmailUid:{ type:String, default:"" },
  attachments:{
  type:Array,
  default:[]
},
  createdAt:{ type:Date, default:Date.now }
})

const Email = mongoose.model("Email", emailSchema)

/* =========================
   AUTH
========================= */

app.post("/api/register", async(req,res)=>{
  try{
    const { username, password } = req.body

    if(!username || !password){
      return res.status(400).json({
        success:false,
        message:"Lengkapi data"
      })
    }

    const email = `${username}@gobin.id`

    const existingUser = await User.findOne({
      $or:[{ username }, { email }]
    })

    if(existingUser){
      return res.status(400).json({
        success:false,
        message:"Username sudah digunakan"
      })
    }

    const hashedPassword = await bcrypt.hash(password,10)

    const newUser = new User({
      username,
      email,
      password:hashedPassword
    })

    await newUser.save()

    res.json({
      success:true,
      message:"Register berhasil",
      user:{ username, email }
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.post("/api/login", async(req,res)=>{
  try{
    const { email, password } = req.body

    if(!email || !password){
      return res.status(400).json({
        success:false,
        message:"Lengkapi data"
      })
    }

    const user = await User.findOne({ email })

    if(!user){
      return res.status(400).json({
        success:false,
        message:"Email tidak ditemukan"
      })
    }

    const isMatch = await bcrypt.compare(password,user.password)

    if(!isMatch){
      return res.status(400).json({
        success:false,
        message:"Password salah"
      })
    }

    res.json({
      success:true,
      message:"Login berhasil",
      user:{
        username:user.username,
        email:user.email
      }
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

/* =========================
   SEND EMAIL
========================= */

app.post("/api/send", upload.array("attachments", 5), async(req,res)=>{
  try{
    const { from, to, subject, message } = req.body

    if(!from || !to){
      return res.status(400).json({
        success:false,
        message:"Data tidak lengkap"
      })
    }

    const cleanFrom = String(from).trim().toLowerCase()
    const cleanTo = String(to).trim().toLowerCase()
    const cleanSubject = subject || "No Subject"
    const cleanMessage = message || ""

    const attachments = (req.files || []).map(file => ({
  filename:file.originalname,
  path:`/uploads/${file.filename}`,
  size:file.size,
  mimetype:file.mimetype
}))

    const sender = await User.findOne({ email:cleanFrom })

    if(!sender){
      return res.status(400).json({
        success:false,
        message:"Pengirim tidak valid"
      })
    }

    const external = isExternalEmail(cleanTo)

    if(!external){
      const receiver = await User.findOne({ email:cleanTo })

      if(!receiver){
        return res.status(400).json({
          success:false,
          message:"Email tujuan Gobin tidak ditemukan"
        })
      }
    }

    if(external){
  const brevoPayload = {
    sender:{
    name:"GoBin",
    email:cleanFrom
    },

    replyTo:{
      email:cleanFrom,
      name:"BinMail User"
    },

    to:[
      {
        email:cleanTo
      }
    ],

    subject:cleanSubject,

    htmlContent:`
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <p style="font-size:13px;color:#6b7280">
          From: <b>${cleanFrom}</b>
        </p>

        <div style="white-space:pre-wrap">
          ${escapeHtmlServer(cleanMessage)}
        </div>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">

        <p style="font-size:12px;color:#6b7280">
          Sent via BinMail / GoBin
        </p>
      </div>
    `
  }

  if(attachments.length > 0){
    brevoPayload.attachment = attachments.map(file => ({
      url:`${req.protocol}://${req.get("host")}${file.path}`,
      name:file.filename
    }))
  }

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    brevoPayload,
    {
      headers:{
        "api-key":process.env.BREVO_API_KEY,
        "Content-Type":"application/json"
      }
    }
  )
}

    const newEmail = new Email({
      from:cleanFrom,
      to:cleanTo,
      subject:cleanSubject,
      message:cleanMessage,
      attachments,
      folder:"inbox",
      read:external ? true : false,
      external
    })

    await newEmail.save()

    res.json({
      success:true,
      message: external
        ? "Email berhasil dikirim ke email luar"
        : "Email berhasil dikirim"
    })

  }catch(err){
    console.log("SEND ERROR:", err)

    res.status(500).json({
      success:false,
      message:"Gagal kirim email. Cek SMTP / App Password."
    })
  }
})

function escapeHtmlServer(text){
  return String(text || "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "'":"&#39;",
    '"':"&quot;"
  }[c]))
}

/* =========================
   DRAFTS
========================= */

app.post("/api/drafts", async(req,res)=>{
  try{
    const { from, to, subject, message } = req.body

    const draft = new Email({
      from,
      to,
      subject,
      message,
      folder:"drafts",
      read:true
    })

    await draft.save()

    res.json({
      success:true,
      message:"Draft berhasil disimpan"
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

/* =========================
   FOLDERS
========================= */

app.get("/api/inbox/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      to:req.params.email,
      folder:"inbox",
      trash:false
    }).sort({ createdAt:-1 })

    res.json({ success:true, emails })

  }catch(err){
    console.log(err)
    res.status(500).json({ success:false, message:"Server error" })
  }
})

app.get("/api/sent/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      from:req.params.email,
      folder:"inbox",
      trash:false
    }).sort({ createdAt:-1 })

    res.json({ success:true, emails })

  }catch(err){
    console.log(err)
    res.status(500).json({ success:false, message:"Server error" })
  }
})

app.get("/api/drafts/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      from:req.params.email,
      folder:"drafts",
      trash:false
    }).sort({ createdAt:-1 })

    res.json({ success:true, emails })

  }catch(err){
    console.log(err)
    res.status(500).json({ success:false, message:"Server error" })
  }
})

app.get("/api/starred/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      $or:[
        { to:req.params.email },
        { from:req.params.email }
      ],
      starred:true
    }).sort({ createdAt:-1 })

    res.json({ success:true, emails })

  }catch(err){
    console.log(err)
    res.status(500).json({ success:false, message:"Server error" })
  }
})

app.get("/api/trash/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      $or:[
        { to:req.params.email },
        { from:req.params.email }
      ],
      folder:"trash"
    }).sort({ createdAt:-1 })

    res.json({ success:true, emails })

  }catch(err){
    console.log(err)
    res.status(500).json({ success:false, message:"Server error" })
  }
})

/* =========================
   UNREAD
========================= */

app.get("/api/unread/:email", async(req,res)=>{
  try{
    const count = await Email.countDocuments({
      to:req.params.email,
      folder:"inbox",
      read:false,
      trash:false
    })

    res.json({
      success:true,
      unread:count
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.patch("/api/read/:id", async(req,res)=>{
  try{
    const email = await Email.findByIdAndUpdate(
      req.params.id,
      { read:true },
      { new:true }
    )

    if(!email){
      return res.status(404).json({
        success:false,
        message:"Email tidak ditemukan"
      })
    }

    res.json({
      success:true,
      message:"Email sudah dibaca",
      email
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})


app.patch("/api/trash/:id", async(req,res)=>{
  try{

    await Email.findByIdAndUpdate(
      req.params.id,
      {
        folder:"trash",
        read:true
      }
    )

    res.json({
      success:true,
      message:"Email dipindah ke trash"
    })

  }catch(err){
    console.log(err)

    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.patch("/api/trash-bulk", async(req,res)=>{
  try{

    const { ids } = req.body

    if(!Array.isArray(ids) || ids.length === 0){
      return res.status(400).json({
        success:false,
        message:"Tidak ada email dipilih"
      })
    }

    await Email.updateMany(
      {
        _id:{ $in:ids }
      },
      {
        folder:"trash",
        read:true
      }
    )

    res.json({
      success:true,
      message:`${ids.length} email dipindah ke Trash`
    })

  }catch(err){
    console.log(err)

    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.delete("/api/delete/:id", async(req,res)=>{
  try{
    await Email.findByIdAndUpdate(
      req.params.id,
      {
        folder:"deleted",
        trash:true,
        read:true
      }
    )

    res.json({
      success:true,
      message:"Email dihapus permanen"
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.delete("/api/delete-trash-all/:email", async(req,res)=>{
  try{
    await Email.updateMany(
      {
        $or:[
          { to:req.params.email },
          { from:req.params.email }
        ],
        folder:"trash"
      },
      {
        folder:"deleted",
        trash:true,
        read:true
      }
    )

    res.json({
      success:true,
      message:"Semua email Trash dihapus permanen"
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})
/* =========================
   USER
========================= */

app.get("/api/user/:email", async(req,res)=>{
  try{
    const user = await User.findOne({
      email:req.params.email
    })

    if(!user){
      return res.status(404).json({
        success:false,
        message:"User tidak ditemukan"
      })
    }

    res.json({
      success:true,
      user:{
        username:user.username,
        email:user.email,
        createdAt:user.createdAt
      }
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})


/* =========================
   IMAP SYNC
========================= */

let imapStarted = false

function extractGobinAddress(parsed){
  const all = []

  if(parsed.to?.value) all.push(...parsed.to.value)
  if(parsed.cc?.value) all.push(...parsed.cc.value)
  if(parsed.headers?.get("x-forwarded-to")) all.push({ address: parsed.headers.get("x-forwarded-to") })
  if(parsed.headers?.get("delivered-to")) all.push({ address: parsed.headers.get("delivered-to") })

  const found = all
    .map(x => String(x.address || x || "").trim().toLowerCase())
    .find(email => email.endsWith("@gobin.id"))

  return found || "admin@gobin.id"
}

async function syncGmailInbox(){
  if(imapStarted) return
  imapStarted = true

  try{
    if(!process.env.IMAP_USER || !process.env.IMAP_PASS){
      console.log("IMAP not configured")
      imapStarted = false
      return
    }

    const client = new ImapFlow({
      host: process.env.IMAP_HOST || "imap.gmail.com",
      port: Number(process.env.IMAP_PORT || 993),
      secure: String(process.env.IMAP_TLS || "true") === "true",
      auth:{
        user:process.env.IMAP_USER,
        pass:process.env.IMAP_PASS
      },
      logger:false
    })

    await client.connect()
    console.log("IMAP Connected")

    const lock = await client.getMailboxLock("INBOX")

    try{
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3)

      for await (const msg of client.fetch(
        { since },
        { uid:true, source:true }
      )){
        const gmailUid = `gmail-${msg.uid}`

        const exists = await Email.findOne({
        gmailUid:gmailUid
      })

        if(exists) continue

        const parsed = await simpleParser(msg.source)

        const cleanFrom =
          parsed.from?.value?.[0]?.address?.toLowerCase() || "unknown"

        const cleanTo = extractGobinAddress(parsed)

        const cleanSubject = parsed.subject || "No Subject"

        const cleanMessage =
          parsed.text ||
          parsed.html ||
          ""

        await Email.create({
          gmailUid:gmailUid,
          from:cleanFrom,
          to:cleanTo,
          subject:cleanSubject,
          message:cleanMessage,
          folder:"inbox",
          read:false,
          external:true
        })

        console.log("IMAP saved:", cleanFrom, "=>", cleanTo, cleanSubject)
      }
    }finally{
      lock.release()
    }

    await client.logout()
    imapStarted = false

  }catch(err){
    imapStarted = false
    console.log("IMAP ERROR:", err.message)
  }
}

setInterval(syncGmailInbox, 60 * 1000)

/* =========================
   SERVER
========================= */

async function startServer(){
  try{
    await mongoose.connect(process.env.MONGO_URI)

    console.log("MongoDB Connected")
    syncGmailInbox()

    if(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS){
  console.log("SMTP configured")
}else{
  console.log("SMTP not configured")
}

    const PORT = process.env.PORT || 8080

    app.listen(PORT,"0.0.0.0",()=>{
      console.log(`Server running on port ${PORT}`)
    })

  }catch(err){
    console.log("Server Error:",err)
  }
}

startServer()