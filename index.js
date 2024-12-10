import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from 'axios';
import fs from 'fs';
import { dirname } from "path";
import { fileURLToPath } from "url";
import env from "dotenv"

env.config();

const app = express();
const port = 3000;

const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

let items = [];


const db=new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

async function List(){
  const result=await db.query("SELECT * FROM items ORDER BY id ASC");
  items=result.rows;
}

// Function to fetch and save book cover image
async function fetchAndSaveCover(isbn) {
  const baseURL = process.env.BASE_URL;
  const url = `${baseURL}/${isbn}-M.jpg`; // API URL
  const fullImagePath = `${__dirname}/public/assets/images/covers/${isbn}.jpg`;
  const dbImagePath = `/assets/images/covers/${isbn}.jpg`; // Path for database

  try {
      const response = await axios.get(url, { responseType: 'stream' });
      const fileStream = fs.createWriteStream(fullImagePath);

      // Pipe the image data to the file
      response.data.pipe(fileStream);

      // Return a promise that resolves after the stream ends
      return new Promise((resolve, reject) => {
          fileStream.on('finish', () => {
              console.log(`Image saved: ${isbn}.jpg`);
              resolve(dbImagePath); // Return path to be stored in database
          });
          fileStream.on('error', (error) => {
              console.error('Error writing file:', error);
              reject(error);
          });
      });
  } catch (error) {
      console.log('Error fetching cover image:', error);
      throw error;
  }
}

// Routes
// Home page showing all books
app.get('/',async(req,res)=>{
  try{
    const result= await db.query("SELECT * FROM books ORDER BY date_read DESC");
    const books=result.rows;
    res.render("index.ejs",{books:books})
  }catch(err){
    console.log(err);
    res.send("Error retriving books");
  }
});


// Route to fetch and display all books by sorting
app.get("/books",async(req,res)=>{
  const sortBy=req.query.sort;
  try{
    console.log(sortBy);
    let result;
    if(sortBy==="title"){
      result= await db.query("SELECT * FROM books ORDER BY title ASC");
    }else{
      result=await db.query(`SELECT * FROM books ORDER BY ${sortBy} DESC`);
    }
    res.render("index.ejs",{books:result.rows});
  }catch(err){
    console.log(err);
    res.send(500).send("Error fetching code");
  }
});


// Route to add a new book (GET - form)
app.get("/books/new",async(req,res)=>{
  res.render("new.ejs");
});


// Route to create a new book db in SQL(POST)
app.post("/books",async(req,res)=>{
  const { isbn, title, author, description, rating, date_read, image_path } = req.body;
  try{
    const imagePath = await fetchAndSaveCover(isbn);        // Fetch and save the cover image
    await db.query(
      'INSERT INTO books (isbn, title, author, description, rating, date_read, image_path) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [isbn, title, author, description, rating, date_read, imagePath]
    );
    res.redirect('/');
  }catch(err){
    console.log(err);
  }
});


// Route to edit a book (GET - form)
app.get("/books/:id/edit",async(req,res)=>{
  const id = req.params.id;
  try{
    const result=await db.query("SELECT * FROM books WHERE id = $1",[id]);
    res.render("edit.ejs",{book:result.rows[0]});
  }catch(err){
    console.log(err);
    res.send("Error retriving book details");
  }
});

// Route to update a book (PUT)
app.post('/books/:id', async (req, res) => {
  const id = req.params.id;
  const { isbn, title, author, description, rating, date_read, image_path } = req.body;
  try {
    await db.query(
      'UPDATE books SET isbn = $1, title = $2, author = $3, description = $4, rating = $5, date_read = $6, image_path = $7 WHERE id = $8',
      [isbn, title, author, description, rating, date_read, image_path, id]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send('Error updating book');
  }
});

// Route to delete a book (DELETE)
app.post('/books/:id/delete', async (req, res) => {
  const id = req.params.id;
  try {
    console.log(id);
    await db.query('DELETE FROM books WHERE id = $1', [id]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.send('Error deleting book');
  }
});

// Route to view notes for a book
app.get("/books/:id/notes",async(req,res)=>{
  const id=req.params.id;
  console.log(id);
  try {
    const bookResult = await db.query('SELECT * FROM books WHERE id = $1', [id]);
    const notesResult = await db.query('SELECT * FROM notes WHERE book_id = $1', [id]);
    const book = bookResult.rows[0];
    const notes = notesResult.rows;
    res.render("notes.ejs", { book:book, notes:notes });
  } catch (err) {
    console.error(err);
    res.send('Error retrieving notes');
  }
});

// Route to add a note (POST)
app.post("/books/:id/notes",async(req,res)=>{
  const id=req.params.id;
  const note=req.body.note;
  console.log(id);
  console.log(note);
  try{
    await db.query('INSERT INTO notes (note, book_id) VALUES ($1, $2)', [note, id]);
    res.redirect(`/books/${id}/notes`);
  }catch(err){
    res.send('Error adding notes');
    console.log(err);
  }
});

// Route to render the edit form for a specific note
app.get('/notes/:id/edit', async (req, res) => {
  const noteId = req.params.id;
  
  try {
    const result = await db.query('SELECT * FROM notes WHERE id = $1', [noteId]);
    const note = result.rows[0];
    res.render("edit-notes.ejs", { note:note });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Route to handle the edit form submission and update the note
app.post('/notes/:id/edit', async (req, res) => {
  const noteId = req.params.id;
  const updatedNote = req.body.note;

  try {
    const result=await db.query('UPDATE notes SET note = $1 WHERE id = $2', [updatedNote, noteId]);
    res.redirect(`/books/${req.body.bookId}/notes`); 
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating note');
  }
});


// Route to delete a note (DELETE)
app.post("/notes/:id/delete",async(req,res)=>{
  const id=req.params.id;
  try{
    await db.query("Delete FROM notes WHERE id=$1",[id]);
    res.redirect("back");
  }catch(err){
    res.send('Error deleting notes');
    console.log(err);
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
//to do 
//1st built the server to get/
//2nd built the complete ejs for home pg then add css