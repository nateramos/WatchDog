import { Shell } from './Layout.jsx'

export default function About() {
  return (
    <Shell>
      <article className="prose">
        <h2>About WatchDog</h2>
        <p className="lead">
          WatchDog is a campus safety tool that informs human responders and does not make
          decisions for them.
        </p>

        <h3>The problem</h3>
        <p>
          When a weapon appears on a campus camera, the first minutes matter. Security staff
          often watch many feeds at once and can miss what one camera shows. WatchDog points a
          person at the moment that needs a second look, so a human can decide quickly.
        </p>

        <h3>What the MVP does</h3>
        <ol>
          <li>WatchDog analyzes a recorded video clip.</li>
          <li>
            An object detection model checks frames from the clip for a possible weapon and
            gives each finding a confidence score. The model is trained on both guns and
            knives, but for now the MVP focuses on guns.
          </li>
          <li>
            Each flagged frame goes to a review screen. A person must confirm or dismiss it
            before anything counts as an alert.
          </li>
          <li>Every flag and every reviewer decision is written to a log.</li>
        </ol>

        <h3>Safety guardrails</h3>
        <ul>
          <li>
            <strong>Human in the loop.</strong> The model never raises an alert by itself. A
            reviewer confirms or dismisses every flag.
          </li>
          <li>
            <strong>Prototype notice.</strong> Every page is marked as a student prototype.
          </li>
          <li>
            <strong>Review log.</strong> Each flag, its confidence score, and the reviewer's
            decision are recorded and can be exported.
          </li>
          <li>
            <strong>No facial recognition.</strong> WatchDog looks for objects, not faces, and
            does not identify anyone.
          </li>
          <li>
            <strong>Video stays on your device.</strong> The model runs inside your browser,
            so video is never sent to a server.
          </li>
          <li>
            <strong>No real people on campus.</strong> Testing uses licensed stock footage and
            staged clips with obvious props, recorded off campus.
          </li>
        </ul>

        <h3>How it works</h3>
        <p>
          The detector is YOLOv8n from Ultralytics, fine-tuned to find guns and knives using
          labeled images from Google's Open Images dataset. It is exported to ONNX and runs in
          the browser with ONNX Runtime Web. The site is built with React and Vite and hosted
          on AWS Amplify.
        </p>
        <p>
          <strong>Speed.</strong> On a 2020 MacBook Air (Intel Core i5, no graphics card), the
          desktop prototype takes about a quarter of a second to run all three steps on one
          frame (person, object, weapon), or about 4 frames per second. The weapon check alone
          takes about 0.1 seconds. The web demo runs only the weapon check, inside the browser
          on one processor core, so it is slower: about 1 to 1.5 seconds per frame.
        </p>
        <p>
          Detectors make mistakes. A false alarm could send responders toward someone holding
          an umbrella; a miss could give false confidence. That is why a person reviews every
          flag, and why the confidence score is always shown.
        </p>

        <h3>Roadmap</h3>
        <ul>
          <li>A simple campus map that shows which camera raised a flag</li>
          <li>Tracking across multiple cameras</li>
          <li>Movement prediction for responders</li>
        </ul>

        <div className="actions actions-left">
          <a className="button button-primary" href="#/demo">View Demo</a>
        </div>
      </article>
    </Shell>
  )
}
