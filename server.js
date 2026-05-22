require("dotenv").config()

const express = require("express")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

/* =========================
   MONGODB CONNECT
========================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB Connected")
})
.catch((err) => {
  console.log(err)
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
   SERVER
========================= */

const PORT = 5000

app.listen(PORT,()=>{

  console.log(
    `Server running on port ${PORT}`
  )

})