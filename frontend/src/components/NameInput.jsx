import { useState } from "react";

function NameInput() {
  const [name, setName] = useState("");

  return (
    <div>
      <h2>Enter your name</h2>

      <input
        type="text"
        placeholder="Type your name"
        onChange={(event) => setName(event.target.value)}
      />

      <h3>Hello {name} 👋</h3>
    </div>
  );
}

export default NameInput;