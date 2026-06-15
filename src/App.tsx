import "./App.css";

function App() {
  // 1. Define the function
  const handleButtonClick = () => {
    console.log("Button was clicked!");
    // You could place your standard fetch() here to talk to your Hue Bridge IP!
  };

  return (
    <main>
      <div className="w-screen h-screen grid items-center justify-center bg-slate-950">
        {/* 2. Attach it to the button using onClick */}
        <button
          onClick={handleButtonClick}
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors duration-300 cursor-pointer active:bg-blue-700"
        >
          Click me
        </button>
      </div>
    </main>
  );
}

export default App;
