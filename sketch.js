// Scale down ASCII art by skipping every other character and line
function scaleDownAscii(asciiStr, scaleFactor = 0.5) {
  // Split into lines
  const lines = asciiStr.split('\n');
  
  // Calculate how many lines/chars to keep based on scale factor
  const lineStep = Math.round(1 / scaleFactor);
  
  let result = '';
  
  // Process each line with appropriate stepping
  for (let y = 0; y < lines.length; y += lineStep) {
    const line = lines[y];
    let newLine = '';
    
    // Skip characters based on scale factor
    for (let x = 0; x < line.length; x += lineStep) {
      newLine += line[x];
    }
    
    result += newLine + '\n';
  }
  
  return result;
}// Global variables
let myFaceLandmarker;
let faceLandmarks;
let myCapture;
let lastVideoTime = -1;
let isCapturing = false;
let isInverted = false;
let asciiDiv;
let currentAsciiImage = '';  // Store current ASCII image for saving

// Mouth animation variables
let mouthOpen = false;
let activeWords = [];  // Array to store currently active words
let wordSpawnRate = 0.2;  // Decreased spawn rate (lower number = more frequent)
let wordSpawnTimer = 0;
let letterAnimationSpeed = 0.1;  // Increased animation speed

// Dynamic canvas size - will be set to window dimensions
let canvasWidth;
let canvasHeight;
// Character resolution for ASCII art
let charResolution = 1; // Character size multiplier to control density

// Characters for face outline (first character is used for drawing)
const asciiCharSets = [
  '# ',                  // Hash with space  
  '@ ',                  // At symbol with space
  '* '                   // Asterisk with space
];

// Store the template ASCII art
let templateAsciiArt;
let templateHeight;

// Calculate the height for the face portion (using full canvas during tracking)
let faceCanvasHeight;

let currentCharSetIndex = 0;
let asciiChars = asciiCharSets[currentCharSetIndex];

// MediaPipe configuration
const trackingConfig = {
  doAcquireFaceMetrics: true,
  cpuOrGpuString: "GPU", // "GPU" or "CPU"
  maxNumFaces: 1,
};

// Custom nose landmarks (from reference code)
const FACELANDMARKER_NOSE = [
  {start:168, end:6}, {start:6, end:195},
  {start:195, end:4}, {start:98, end:97},
  {start:97, end:2}, {start:2, end:326},
  {start:326, end:327}
];

// Preload function to load MediaPipe
async function preload() {
  try {
    // Load MediaPipe modules
    const mediapipe_module = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js');
    window.FaceLandmarker = mediapipe_module.FaceLandmarker;
    window.FilesetResolver = mediapipe_module.FilesetResolver;
    
    // Initialize vision
    const vision = await window.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
    );
    
    // Create face landmarker using the same options as reference code
    myFaceLandmarker = await window.FaceLandmarker.createFromOptions(vision, {
      numFaces: trackingConfig.maxNumFaces,
      runningMode: "VIDEO",
      outputFaceBlendshapes: trackingConfig.doAcquireFaceMetrics,
      baseOptions: {
        delegate: trackingConfig.cpuOrGpuString,
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      },
    });
    
    console.log("MediaPipe loaded successfully");
  } catch (error) {
    console.error("Error loading MediaPipe:", error);
  }
}

// Calculate optimal character resolution based on screen size
function calculateCharResolution() {
  // Base resolution on screen width
  if (windowWidth < 768) {
    // Mobile/smaller screens - fewer characters
    charResolution = 2;
  } else if (windowWidth < 1200) {
    // Medium screens
    charResolution = 1.5;
  } else {
    // Large screens - more characters
    charResolution = 1;
  }
  
  // Update canvas dimensions based on character resolution
  canvasWidth = Math.floor(windowWidth / (4 * charResolution));
  canvasHeight = Math.floor(windowHeight / (4 * charResolution));
  
  console.log(`Screen size: ${windowWidth}x${windowHeight}`);
  console.log(`Character resolution: ${charResolution}`);
  console.log(`Canvas dimensions: ${canvasWidth}x${canvasHeight}`);
}

// Setup function - P5.js
function setup() {
  // Calculate the optimal resolution and canvas size
  calculateCharResolution();
  
  // Create canvas at the calculated size
  createCanvas(canvasWidth, canvasHeight);
  
  // Hide the P5 canvas (we'll display ASCII art instead)
  let cnv = document.querySelector('canvas');
  if (cnv) cnv.style.display = 'none';
  
  // Get DOM elements
  asciiDiv = document.getElementById('ascii-container');
  
  // Apply styling to ascii container
  configureAsciiContainer();
  
  // Set up button event listeners
  document.getElementById('style-btn').addEventListener('click', changeAsciiStyle);
  document.getElementById('save-btn').addEventListener('click', saveAsciiArt);
  
  // Add window resize listener
  window.addEventListener('resize', windowResized);
  
  // Set initial frameRate
  frameRate(15);
  
  // Initialize the template ASCII art
  initializeTemplateAscii();
  
  // During tracking, use the full canvas height for face
  faceCanvasHeight = canvasHeight;
}

// Handle window resize
function windowResized() {
  // Recalculate optimal resolution and canvas size
  calculateCharResolution();
  
  // Resize the canvas
  resizeCanvas(canvasWidth, canvasHeight);
  
  // Update ASCII container size
  configureAsciiContainer();
  
  // Update faceCanvasHeight
  faceCanvasHeight = canvasHeight;
  
  console.log("Window resized, new dimensions:", canvasWidth, canvasHeight);
}

// Initialize template ASCII art from the provided string
function initializeTemplateAscii() {
  // This is the ASCII art we'll place below the face when saving
  const asciiString = `Thank you for playing Embodied!`;

  // Parse the template
  const lines = asciiString.split('\n');
  
  // We won't scale the ASCII art - use it as is at full width (80 chars)
  templateAsciiArt = lines.map(line => line.split(''));
  templateHeight = lines.length;
}

// Function to draw hair on the ASCII face
function drawHair(grid, landmarks, char) {
  // We need to identify the top portion of the face to add hair
  // First, find the top points of the face oval
  const faceOval = window.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
  
  // Calculate scaling factor to match the face drawing
  const faceWidthNormalized = 0.6;
  const scaleFactor = faceWidthNormalized * canvasWidth;
  
  // Calculate center of canvas for positioning
  const centerX = Math.floor(canvasWidth / 2);
  const centerY = Math.floor(canvasHeight / 2);
  
  // Find the top-most points of the face oval
  let topPoints = [];
  
  // Only use the top portion of the face oval for hair (approximately the top 1/3)
  // Face oval points are roughly in clockwise order, with top points in the first part
  const topFacePointCount = Math.floor(faceOval.length / 3);
  
  for (let i = 0; i < topFacePointCount; i++) {
    const connector = faceOval[i];
    const point = landmarks[connector.start];
    
    if (point) {
      // Use the same coordinate transformation as the face drawing
      const x = Math.floor(centerX + (point.x - 0.5) * scaleFactor);
      const y = Math.floor(centerY + (point.y - 0.5) * scaleFactor);
      
      topPoints.push({ x, y });
    }
  }
  
  // Sort points from left to right
  topPoints.sort((a, b) => a.x - b.x);
  
  // Define hair styles (we'll start with a simple style)
  // Draw hair above the top points
  const hairHeight = Math.floor(canvasHeight * 0.05); // How tall the hair should be
  const hairDensity = 0.7; // Probability of drawing a hair character (0-1)
  const hairChar = char; // Use the same character as the face outline
  
  // For each top point, draw hair strands above it
  for (let i = 0; i < topPoints.length; i++) {
    const point = topPoints[i];
    
    // Draw multiple hair strands of varying heights
    for (let h = 1; h <= hairHeight; h++) {
      // Vary the height slightly for a more natural look
      const heightVariation = Math.floor(Math.random() * 3) - 1;
      const hairY = point.y - h + heightVariation;
      
      // Add some horizontal variation
      const xVariation = Math.floor(Math.random() * 3) - 1;
      const hairX = point.x + xVariation;
      
      // Only draw some of the potential hair points for a more natural look
      if (Math.random() < hairDensity) {
        // Check bounds
        if (hairX >= 0 && hairX < canvasWidth && hairY >= 0 && hairY < canvasHeight) {
          grid[hairY][hairX] = hairChar;
        }
      }
    }
  }
  
  // Add some additional hair to fill in the top
  const leftMost = topPoints[0]?.x || centerX - 10;
  const rightMost = topPoints[topPoints.length - 1]?.x || centerX + 10;
  const topMost = Math.min(...topPoints.map(p => p.y)) - hairHeight;
  
  // Create a "poof" of hair on top
  for (let x = leftMost; x <= rightMost; x++) {
    for (let y = topMost; y < topMost + hairHeight * 1.5; y++) {
      // Only draw some points for a more natural look
      if (Math.random() < hairDensity * 0.7) {
        // Check bounds
        if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
          grid[y][x] = hairChar;
        }
      }
    }
  }
}

// Configure the ASCII container
function configureAsciiContainer() {
  // Set to fit the window
  asciiDiv.style.width = '100vw';
  asciiDiv.style.height = '100vh';
  asciiDiv.style.maxWidth = '100%';
  asciiDiv.style.maxHeight = '100%';
  asciiDiv.style.overflow = 'hidden';
  asciiDiv.style.padding = '0';
  asciiDiv.style.margin = '0';
  
  // Calculate font size based on window size and character resolution
  const fontSizePixels = Math.max(3, Math.floor(4 / charResolution));
  
  // Font tweaks
  asciiDiv.style.fontSize = `${fontSizePixels}px`;
  asciiDiv.style.lineHeight = `${fontSizePixels}px`;
  asciiDiv.style.letterSpacing = '0px';
  asciiDiv.style.fontFamily = 'monospace';
  asciiDiv.style.fontWeight = 'bold';
  
  console.log(`Font size: ${fontSizePixels}px`);
}

// Toggle invert display
function toggleInvert() {
  isInverted = !isInverted;
}

// Toggle camera on/off
function toggleCamera() {
  if (isCapturing) {
    // Turn off camera
    if (myCapture) {
      myCapture.remove();
      myCapture = null;
    }
    isCapturing = false;
  } else {
    try {
      myCapture = createCapture(VIDEO);
      myCapture.size(canvasWidth, canvasHeight);
      myCapture.hide();
      
      isCapturing = true;
      
      // Start face detection loop
      requestAnimationFrame(predictWebcam);
    } catch (error) {
      console.error('Error accessing the camera:', error);
    }
  }
}

// Process webcam frames with MediaPipe
async function predictWebcam() {
  if (!isCapturing || !myCapture || !myFaceLandmarker) {
    // If not capturing or no face landmarker, request next frame and return
    requestAnimationFrame(predictWebcam);
    return;
  }
  
  let startTimeMs = performance.now();
  if (lastVideoTime !== myCapture.elt.currentTime) {
    faceLandmarks = myFaceLandmarker.detectForVideo(myCapture.elt, startTimeMs);
    lastVideoTime = myCapture.elt.currentTime;
  }
  
  // Continue the loop
  requestAnimationFrame(predictWebcam);
}

// Change ASCII character set
function changeAsciiStyle() {
  currentCharSetIndex = (currentCharSetIndex + 1) % asciiCharSets.length;
  asciiChars = asciiCharSets[currentCharSetIndex];
}

// Generate a random alphabet character (A-Z)
function getRandomAlphabet() {
  // Get a random number between 0-25 (26 letters)
  const randomNum = Math.floor(Math.random() * 26);
  // Convert to alphabet (ASCII code for 'A' is 65)
  return String.fromCharCode(65 + randomNum);
}

// Function to check if mouth is open
function isMouthOpen(landmarks) {
  if (!landmarks || landmarks.length === 0) return false;
  
  // Get the top and bottom lip landmarks
  const topLip = landmarks[13];  // Upper lip middle
  const bottomLip = landmarks[14]; // Lower lip middle
  
  if (!topLip || !bottomLip) return false;
  
  // Calculate vertical distance between lips
  const lipDistance = Math.abs(bottomLip.y - topLip.y);
  
  // Define threshold for mouth open (adjust this value as needed)
  const mouthOpenThreshold = 0.02; // Reduced threshold to make it more sensitive
  
  const isOpen = lipDistance > mouthOpenThreshold;
  
  // Hide instruction when mouth opens for the first time
  if (isOpen && !mouthOpen) {
    const instruction = document.getElementById('instruction-overlay');
    if (instruction) {
      instruction.style.display = 'none';
    }
  }
  
  return isOpen;
}

// Function to initialize name letters
function initializeNameLetters() {
  const userNameInput = document.getElementById('user-name');
  let userName = userNameInput ? userNameInput.value.trim() : 'Anonymous';
  
  // Reset arrays
  nameLetters = userName.split('');
  letterPositions = [];
  currentLetterIndex = 0;
  letterAnimationProgress = 0;
  
  // Initialize positions for each letter
  for (let i = 0; i < nameLetters.length; i++) {
    letterPositions.push({
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      targetX: Math.random() * canvasWidth,
      targetY: Math.random() * canvasHeight
    });
  }
}

// Function to get mouth position
function getMouthPosition(landmarks) {
  if (!landmarks || landmarks.length === 0) return null;
  
  // Get the bottom lip middle point
  const bottomLip = landmarks[14];
  if (!bottomLip) return null;
  
  // Calculate scaling factor to match the face drawing
  const faceWidthNormalized = 0.6;
  const scaleFactor = faceWidthNormalized * canvasWidth;
  
  // Calculate center of canvas for positioning
  const centerX = Math.floor(canvasWidth / 2);
  const centerY = Math.floor(canvasHeight / 2);
  
  // Center-based coordinates (0.5, 0.5 is the center)
  // Convert normalized coordinates to grid coordinates with centering - same as face drawing
  const pos = {
    x: Math.floor(centerX + (bottomLip.x - 0.5) * scaleFactor),
    y: Math.floor(centerY + (bottomLip.y - 0.5) * scaleFactor)
  };
  
  return pos;
}

// Function to initialize a new word
function spawnNewWord(mouthPos) {
  if (!mouthPos) return;
  
  // Get the poem text
  const poemInput = document.getElementById('poem-text');
  let poemText = poemInput ? poemInput.value.trim() : 'Write me a poem about you';
  
  // If no poem text, use a default
  if (!poemText) {
    poemText = 'Write me a poem about you';
  }
  
  // Split into words and get a random word
  const words = poemText.split(' ');
  const randomWord = words[Math.floor(Math.random() * words.length)];
  
  // Create new word with initial position at mouth
  activeWords.push({
    text: randomWord,
    x: mouthPos.x,
    y: mouthPos.y,
    speed: 0.4 + Math.random() * 0.3,  // Faster fall speed
    rotation: Math.random() * 360,      // Random rotation
    rotationSpeed: (Math.random() - 0.5) * 3,  // Faster rotation speed
    spreadSpeed: 0.1 + Math.random() * 0.2,    // Faster spread speed
    spreadProgress: 0,                          // Current spread progress
    letters: randomWord.split('').map((char, i) => ({
      char: char,
      offsetX: (i - randomWord.length/2) * 2,  // Increased letter spacing
      offsetY: 0,
      speed: 0.4 + Math.random() * 0.3,        // Faster individual letter speed
      rotation: Math.random() * 360,            // Individual letter rotation
      rotationSpeed: (Math.random() - 0.5) * 3  // Faster individual rotation speed
    }))
  });
  
  // Limit the number of active words to prevent performance issues
  if (activeWords.length > 15) {  // Increased max words
    activeWords.shift();  // Remove oldest word
  }
}

// Function to animate words
function animateLetters(grid) {
  // Update spawn timer
  wordSpawnTimer += letterAnimationSpeed;
  if (wordSpawnTimer >= wordSpawnRate) {
    wordSpawnTimer = 0;
    const mouthPos = getMouthPosition(faceLandmarks.faceLandmarks[0]);
    if (mouthPos) {
      spawnNewWord(mouthPos);
    }
  }
  
  // Update and draw each word
  for (let i = activeWords.length - 1; i >= 0; i--) {
    const word = activeWords[i];
    
    // Update word position
    word.y += word.speed;
    word.rotation += word.rotationSpeed;
    
    // Update spread progress
    word.spreadProgress += word.spreadSpeed;
    
    // Update and draw each letter in the word
    for (let j = 0; j < word.letters.length; j++) {
      const letter = word.letters[j];
      
      // Calculate letter position with spread
      const spreadX = letter.offsetX * word.spreadProgress;
      const spreadY = letter.offsetY * word.spreadProgress;
      
      // Add some random movement (increased for more dynamic effect)
      const randomX = (Math.random() - 0.5) * 0.4;
      const randomY = (Math.random() - 0.5) * 0.4;
      
      // Calculate final position
      const finalX = word.x + spreadX + randomX;
      const finalY = word.y + spreadY + randomY;
      
      // Update letter rotation
      letter.rotation += letter.rotationSpeed;
      
      // Convert to grid coordinates
      const gridX = Math.floor(finalX);
      const gridY = Math.floor(finalY);
      
      // Draw letter if within bounds
      if (gridX >= 0 && gridX < canvasWidth && gridY >= 0 && gridY < canvasHeight) {
        grid[gridY][gridX] = letter.char;
      }
    }
    
    // Remove word if it's fallen off the bottom
    if (word.y > canvasHeight) {
      activeWords.splice(i, 1);
    }
  }
}

// Create face-only ASCII grid (used for display during tracking)
function createFaceOnlyAscii(landmarks) {
  // Create a blank 2D array for the face
  const faceGrid = Array(canvasHeight).fill().map(() => Array(canvasWidth).fill(' '));
  
  // Character to use for all outlines
  const outlineChar = asciiChars[0];
  
  // Draw face landmarks on the face grid
  if (window.FaceLandmarker) {
    // Draw ONLY the outline parts we want to keep
    drawLandmarkConnectors(faceGrid, landmarks, window.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, outlineChar);
    drawLandmarkConnectors(faceGrid, landmarks, window.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, outlineChar);
    drawLandmarkConnectors(faceGrid, landmarks, window.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, outlineChar);
    drawLandmarkConnectors(faceGrid, landmarks, window.FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, outlineChar);
    drawLandmarkConnectors(faceGrid, landmarks, window.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, outlineChar);
    drawLandmarkConnectors(faceGrid, landmarks, window.FaceLandmarker.FACE_LANDMARKS_LIPS, outlineChar);
    drawLandmarkConnectors(faceGrid, landmarks, FACELANDMARKER_NOSE, outlineChar);
    
  }
  
  // Check if mouth is open and animate letters if it is
  const wasMouthOpen = mouthOpen;
  mouthOpen = isMouthOpen(landmarks);
  
  // Clear letters when mouth closes
  if (!mouthOpen && wasMouthOpen) {
    activeWords = [];
  }
  
  // Animate letters if mouth is open
  if (mouthOpen) {
    animateLetters(faceGrid);
  }
  
  // Convert grid to string
  let result = '';
  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      result += faceGrid[y][x];
    }
    result += '\n';
  }
  
  return result;
}

// Create combined ASCII with face outline followed by template and user name
function createCombinedAsciiForSaving(faceAscii) {
  // Scale down the face ASCII to 50% size for export
  const scaledFaceAscii = scaleDownAscii(faceAscii, 0.5);
  
  // Create template part as a string
  let templatePart = '';
  for (let y = 0; y < templateAsciiArt.length; y++) {
    // Use template as is (full width)
    templatePart += templateAsciiArt[y].join('') + '\n';
  }
  
  // Set the number of blank lines between face and ASCII art
  const spacingLines = 2;  // Adjust this number to change spacing
  const spacing = '\n'.repeat(spacingLines);
  
  // Get user name from input field (for saving only)
  const userNameInput = document.getElementById('user-name');
  let userName = userNameInput ? userNameInput.value.trim() : '';
  
  // If user didn't enter a name, use a default
  if (!userName) {
    userName = 'Anonymous';
  }
  
  // Add name with proper formatting and spacing
  const nameSpacing = '\n\n';  // Two blank lines before name
  const nameText = 'Created by: ' + userName;
  
  // Combine face ASCII with template and name
  return scaledFaceAscii + spacing + templatePart + nameSpacing + nameText;
}

// Save ASCII art as text file with random alphabet at the end
function saveAsciiArt() {
  if (asciiDiv.textContent) {
    // Generate a random alphabet character (A-Z)
    const randomChar = getRandomAlphabet();
    
    // Create combined ASCII (face + template + user name)
    let combinedAscii = createCombinedAsciiForSaving(asciiDiv.textContent);
    
    // Handle inversion for template part if necessary
    if (isInverted) {
      combinedAscii = invertAsciiArt(combinedAscii);
    }
    
    // Get user name for filename
    const userNameInput = document.getElementById('user-name');
    let userName = userNameInput ? userNameInput.value.trim() : '';
    if (!userName) {
      userName = 'anonymous';
    }
    
    // Create filename with user name and random character
    const filename = `face_outline_${userName}_${randomChar}.txt`;
    
    // Save the file
    saveStrings(combinedAscii.split('\n'), filename);
    
    // Update download link if it exists
    const downloadLink = document.getElementById('download-link');
    if (downloadLink) {
      // Create a blob from the combined ASCII content
      const blob = new Blob([combinedAscii], {type: 'text/plain'});
      const url = URL.createObjectURL(blob);
      
      // Update the download link
      downloadLink.href = url;
      downloadLink.download = filename;
      downloadLink.style.display = 'inline-block';
      downloadLink.textContent = `Download ${filename}`;
    }
  }
}

// Draw landmark connectors on ASCII grid
function drawLandmarkConnectors(grid, landmarks, connectorSet, char) {
  if (!landmarks || !connectorSet) return;
  
  // Calculate a scaling factor to ensure face is properly sized
  // Based on face width relative to canvas width
  const faceWidthNormalized = 0.6; // Adjust this value to control face size
  const scaleFactor = faceWidthNormalized * canvasWidth;
  
  // Calculate center of canvas for positioning
  const centerX = Math.floor(canvasWidth / 2);
  const centerY = Math.floor(canvasHeight / 2);
  
  // For each connector
  for (let i = 0; i < connectorSet.length; i++) {
    const connector = connectorSet[i];
    const startPoint = landmarks[connector.start];
    const endPoint = landmarks[connector.end];
    
    if (!startPoint || !endPoint) continue;
    
    // Center-based coordinates (0.5, 0.5 is the center)
    // Convert normalized coordinates to grid coordinates with centering
    const x1 = Math.floor(centerX + (startPoint.x - 0.5) * scaleFactor);
    const y1 = Math.floor(centerY + (startPoint.y - 0.5) * scaleFactor);
    const x2 = Math.floor(centerX + (endPoint.x - 0.5) * scaleFactor);
    const y2 = Math.floor(centerY + (endPoint.y - 0.5) * scaleFactor);
    
    // Draw line using standard Bresenham
    drawBresenhamLine(grid, x1, y1, x2, y2, char);
  }
}

// Bresenham's line algorithm
function drawBresenhamLine(grid, x1, y1, x2, y2, char) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = (x1 < x2) ? 1 : -1;
  const sy = (y1 < y2) ? 1 : -1;
  let err = dx - dy;
  
  while (true) {
    // Check bounds
    if (x1 >= 0 && x1 < canvasWidth && y1 >= 0 && y1 < grid.length) {
      grid[y1][x1] = char;
    }
    
    if (x1 === x2 && y1 === y2) break;
    
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }
}

// Invert ASCII art (replace spaces with characters and vice versa)
function invertAsciiArt(asciiStr) {
  let result = '';
  for (let i = 0; i < asciiStr.length; i++) {
    const char = asciiStr[i];
    if (char === '\n') {
      result += '\n';
    } else if (char === ' ') {
      result += asciiChars[0]; // Replace space with outline character
    } else {
      result += ' '; // Replace any character with space
    }
  }
  return result;
}

// P5.js draw function - runs continuously
function draw() {
  // Only process when camera is active
  if (isCapturing && myCapture) {
    // We don't need to draw the video to the canvas for background detection
    // Just clear the canvas to ensure no background processing
    clear();
    
    // Generate ASCII art with ONLY the face outline (no template)
    let asciiImage = '';
    
    // Check if we have face landmarks
    if (faceLandmarks && faceLandmarks.faceLandmarks && faceLandmarks.faceLandmarks.length > 0) {
      // Create face-only ASCII art (without template)
      asciiImage = createFaceOnlyAscii(faceLandmarks.faceLandmarks[0]);
    } else {
      // If no face detected, just show blank space
      asciiImage = ' '.repeat(canvasWidth * canvasHeight).replace(new RegExp(`.{${canvasWidth}}`, 'g'), '$&\n');
    }
    
    // Apply inversion if needed
    if (isInverted) {
      asciiImage = invertAsciiArt(asciiImage);
    }
    
    // Update the ASCII div with face-only (no template)
    asciiDiv.textContent = asciiImage;
    
    // Store the current ASCII image for saving
    currentAsciiImage = asciiImage;
  }
}