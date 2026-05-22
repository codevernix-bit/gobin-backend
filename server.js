require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const cors = require("cors")

const app = express()

app.use(cors({ origin: "*" }))
app.use(express.json())

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BinMail API Running"
  })
})

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
  createdAt:{ type:Date, default:Date.now }
})

const Email = mongoose.model("Email", emailSchema)

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

app.post("/api/send", async(req,res)=>{
  try{
    const { from, to, subject, message } = req.body

    if(!from || !to){
      return res.status(400).json({
        success:false,
        message:"Data tidak lengkap"
      })
    }

    const receiver = await User.findOne({ email:to })

    if(!receiver){
      return res.status(400).json({
        success:false,
        message:"Email tujuan tidak ditemukan"
      })
    }

    const newEmail = new Email({
      from,
      to,
      subject,
      message,
      folder:"inbox",
      read:false
    })

    await newEmail.save()

    res.json({
      success:true,
      message:"Email berhasil dikirim"
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

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

app.get("/api/inbox/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      to:req.params.email,
      folder:"inbox"
    }).sort({ createdAt:-1 })

    res.json({
      success:true,
      emails
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.get("/api/sent/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      from:req.params.email,
      folder:"inbox"
    }).sort({ createdAt:-1 })

    res.json({
      success:true,
      emails
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.get("/api/drafts/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      from:req.params.email,
      folder:"drafts"
    }).sort({ createdAt:-1 })

    res.json({
      success:true,
      emails
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
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

    res.json({
      success:true,
      emails
    })

  }catch(err){
    console.log(err)
    res.status(500).json({
      success:false,
      message:"Server error"
    })
  }
})

app.get("/api/trash/:email", async(req,res)=>{
  try{
    const emails = await Email.find({
      $or:[
        { to:req.params.email },
        { from:req.params.email }
      ],
      trash:true
    }).sort({ createdAt:-1 })

    res.json({
      success:true,
      emails
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
   UNREAD COUNT
========================= */

app.get("/api/unread/:email", async(req,res)=>{
  try{
    const count = await Email.countDocuments({
      to:req.params.email,
      folder:"inbox",
      read:false
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

/* =========================
   MARK EMAIL AS READ
========================= */

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

async function startServer(){
  try{
    await mongoose.connect(process.env.MONGO_URI)

    console.log("MongoDB Connected")

    const PORT = process.env.PORT || 8080

    app.listen(PORT,"0.0.0.0",()=>{
      console.log(`Server running on port ${PORT}`)
    })

  }catch(err){
    console.log("Server Error:",err)
  }
}

startServer()