require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const cors = require("cors")

const app = express()

/* =========================
   MIDDLEWARE
========================= */

app.use(cors({
  origin: "*"
}))

app.use(express.json())

/* =========================
   ROOT
========================= */

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "BinMail API Running"
  })

})

/* =========================
   USER MODEL
========================= */

const userSchema = new mongoose.Schema({

  username:{
    type:String,
    required:true,
    unique:true
  },

  email:{
    type:String,
    required:true,
    unique:true
  },

  password:{
    type:String,
    required:true
  },

  createdAt:{
    type:Date,
    default:Date.now
  }

})

const User = mongoose.model("User", userSchema)

/* =========================
   REGISTER API
========================= */

app.post("/api/register", async(req,res)=>{

  try{

    const {
      username,
      password
    } = req.body

    if(!username || !password){

      return res.status(400).json({
        success:false,
        message:"Lengkapi data"
      })

    }

    const email =
    `${username}@gobin.id`

    const existingUser =
    await User.findOne({
      $or:[
        { username },
        { email }
      ]
    })

    if(existingUser){

      return res.status(400).json({
        success:false,
        message:"Username sudah digunakan"
      })

    }

    const hashedPassword =
    await bcrypt.hash(password,10)

    const newUser =
    new User({
      username,
      email,
      password:hashedPassword
    })

    await newUser.save()

    res.json({

      success:true,
      message:"Register berhasil",

      user:{
        username,
        email
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
   LOGIN API
========================= */

app.post("/api/login", async(req,res)=>{

  try{

    const {
      email,
      password
    } = req.body

    if(!email || !password){

      return res.status(400).json({
        success:false,
        message:"Lengkapi data"
      })

    }

    const user =
    await User.findOne({ email })

    if(!user){

      return res.status(400).json({
        success:false,
        message:"Email tidak ditemukan"
      })

    }

    const isMatch =
    await bcrypt.compare(
      password,
      user.password
    )

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
   USER PROFILE API
========================= */

app.get("/api/user/:email", async(req,res)=>{

  try{

    const user =
    await User.findOne({
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
   START SERVER
========================= */

async function startServer(){

  try{

    await mongoose.connect(process.env.MONGO_URI)

    console.log("MongoDB Connected")

    const PORT =
    process.env.PORT || 8080

    app.listen(PORT,()=>{

      console.log(
        `Server running on port ${PORT}`
      )

    })

  }catch(err){

    console.log("Server Error:", err)

  }

}

startServer()