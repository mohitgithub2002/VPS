# Student Management API Documentation

## Overview

This API provides endpoints for managing student data in a school management system using Supabase as the database backend.

## Base URL

```bash
/api/admin/students
```

## API Endpoints

### Create Student (POST)

Creates a new student record in the database.

### Request

```json
POST /api/admin/students

{
  "rollNo": "string",
  "name": "string",
  "fatherName": "string",
  "motherName": "string",
  "gender": "string",
  "dob": "date",
  "email": "string",
  "mobile": "string",
  "password": "string",
  "class": "string",
  "section": "string",
  "address": "string",
  "addmissionDate": "date"
}

```

### Required Fields

- name
- email
- mobile
- dob
- address
- rollNo
- class
- section

### Response

```json
// Success (201)
{
  "message": "Student created successfully",
  "student": {
    // Student object
  }
}

// Error (400)
{
  "error": "Missing required fields"
}

// Error (500)
{
  "error": "Internal Server Error"
}

```

### Get Students (GET)

Retrieves student records with optional filtering.

### Query Parameters

- `class`: Filter by class name
- `section`: Filter by section (requires class parameter)
- `rollNo`: Get specific student by roll number (requires class parameter)

### Example Requests

```
GET /api/admin/students
GET /api/admin/students?class=10
GET /api/admin/students?class=10&section=A
GET /api/admin/students?class=10&rollNo=1234

```

### Response

```json
// Success (200)
{
  "students": [
    {
      "roll_no": "string",
      "name": "string",
      "father_name": "string",
      "mother_name": "string",
      "gender": "string",
      "date_of_birth": "date",
      "email": "string",
      "mobile": "string",
      "class": "string",
      "section": "string",
      "address": "string",
      "admission_date": "date",
      "created_at": "datetime"
    }
  ]
}

// Error (500)
{
  "error": "Internal Server Error"
}

```

## Database Schema

```sql
Table: students
- roll_no (string)
- name (string)
- father_name (string)
- mother_name (string)
- gender (string)
- date_of_birth (date)
- email (string)
- mobile (string)
- password (string)
- class (string)
- section (string)
- address (text)
- admission_date (date)
- created_at (timestamp)

```

## Helper Functions

### `getAllStudents()`

Retrieves all students from the database.

### `getStudentsByClass(className)`

Retrieves students filtered by class.

### `getStudentsByClassAndSection(className, section)`

Retrieves students filtered by class and section.

### `getStudentByClassAndRollNo(className, rollNo)`

Retrieves a single student by class and roll number.

## Usage Example

```jsx
// Create a new student
const response = await fetch('/api/admin/students', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    rollNo: "1001",
    name: "John Doe",
    email: "john@example.com",
    mobile: "1234567890",
    class: "10",
    section: "A",
    dob: "2006-01-01",
    address: "123 School Street"
  })
});

// Get all students from class 10
const students = await fetch('/api/admin/students?class=10');

```