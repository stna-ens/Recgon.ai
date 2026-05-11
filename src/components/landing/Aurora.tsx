'use client';

import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
// 0.0 = dark-mode (default): aurora color is dimmed by intensity, so the
// ribbon shape comes from both color brightness and alpha. Designed for
// dark bgs where dim-pink-on-black looks like a ribbon.
// 1.0 = light-mode: aurora color is rampColor directly (no intensity
// dim), and the ribbon shape comes purely from the alpha mask. Designed
// for light bgs where dim color would paint as visible gray smudges.
uniform float uLightMode;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \
  int index = 0;                                            \
  for (int i = 0; i < 2; i++) {                               \
     ColorStop currentColor = colors[i];                    \
     bool isInBetween = currentColor.position <= factor;    \
     index = int(mix(float(index), float(i), float(isInBetween))); \
  }                                                         \
  ColorStop currentColor = colors[index];                   \
  ColorStop nextColor = colors[index + 1];                  \
  float range = nextColor.position - currentColor.position; \
  float lerpFactor = (factor - currentColor.position) / range; \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  // Dark mode: dim the ramp by intensity (original behavior, looks correct
  // on dark bgs because the dim color reads as a ribbon over black).
  // Light mode: use rampColor as-is — shape comes from alpha alone, so
  // white stops paint white (invisible on white bg) and pink stops paint
  // pink (clean tinted ribbon).
  vec3 auroraColor = mix(intensity * rampColor, rampColor, uLightMode);

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`;

interface AuroraProps {
  colorStops?: string[];
  amplitude?: number;
  blend?: number;
  speed?: number;
  time?: number;
  // When true, the shader skips the intensity * rampColor dimming step and
  // uses rampColor directly. Use this on light backgrounds — see uLightMode
  // comment in the fragment shader for the full rationale.
  lightMode?: boolean;
}

export default function Aurora({
  colorStops = ['#5227FF', '#7cff67', '#5227FF'],
  amplitude = 1.0,
  blend = 0.5,
  speed = 1.0,
  lightMode = false,
}: AuroraProps) {
  const propsRef = useRef<AuroraProps>({ colorStops, amplitude, blend, speed, lightMode });
  propsRef.current = { colorStops, amplitude, blend, speed, lightMode };

  const ctnDom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctn = ctnDom.current;
    if (!ctn) return;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    (gl.canvas as HTMLCanvasElement).style.backgroundColor = 'transparent';

    let program: Program;

    function resize() {
      if (!ctn) return;
      const width = ctn.offsetWidth;
      const height = ctn.offsetHeight;
      renderer.setSize(width, height);
      if (program) {
        (program.uniforms as Record<string, { value: unknown }>).uResolution.value = [width, height];
      }
    }
    window.addEventListener('resize', resize);

    const geometry = new Triangle(gl);

    // Cache the parsed color stops keyed by their joined hex string. The
    // shader needs `[r,g,b]` triples, which previously meant allocating
    // three new `Color` instances and a fresh outer array on EVERY frame.
    // Color stops change rarely (theme toggle), so memoize by the stop
    // signature and reuse the same buffer otherwise.
    let cachedStopsKey = '';
    let cachedStopsArr: number[][] = [];
    const stopsToArray = (stops: string[]): number[][] => {
      const key = stops.join('|');
      if (key === cachedStopsKey) return cachedStopsArr;
      cachedStopsKey = key;
      cachedStopsArr = stops.map((hex) => {
        const c = new Color(hex);
        return [c.r, c.g, c.b];
      });
      return cachedStopsArr;
    };

    const colorStopsArray = stopsToArray(colorStops);

    program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: amplitude },
        uColorStops: { value: colorStopsArray },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uBlend: { value: blend },
        uLightMode: { value: lightMode ? 1.0 : 0.0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    ctn.appendChild(gl.canvas);

    // Visibility / viewport gates. Aurora is a fragment-shader fullscreen
    // pass — even small changes (amplitude, time) trigger a full GPU draw.
    // When the canvas is offscreen or the tab is hidden we avoid scheduling
    // any rAF at all and resume on the next observable transition.
    let animateId = 0;
    let visible = !document.hidden;
    let onScreen = true;
    let running = false;

    const update = (t: number) => {
      animateId = 0;
      if (!visible || !onScreen) {
        running = false;
        return;
      }
      const { time = t * 0.01, speed: spd = 1.0 } = propsRef.current as AuroraProps & { time?: number };
      const uniforms = program.uniforms as Record<string, { value: unknown }>;
      uniforms.uTime.value = time * (spd ?? 1) * 0.1;
      uniforms.uAmplitude.value = propsRef.current.amplitude ?? 1.0;
      uniforms.uBlend.value = propsRef.current.blend ?? blend;
      uniforms.uColorStops.value = stopsToArray(propsRef.current.colorStops ?? colorStops);
      renderer.render({ scene: mesh });
      animateId = requestAnimationFrame(update);
    };
    const start = () => {
      if (running) return;
      if (!visible || !onScreen) return;
      running = true;
      animateId = requestAnimationFrame(update);
    };
    const stop = () => {
      if (animateId) cancelAnimationFrame(animateId);
      animateId = 0;
      running = false;
    };

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (!e) return;
          onScreen = e.isIntersecting;
          if (onScreen) start();
          else stop();
        },
        { rootMargin: '64px' },
      );
      io.observe(ctn);
    }

    start();
    resize();

    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      if (ctn && (gl.canvas as HTMLCanvasElement).parentNode === ctn) {
        ctn.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amplitude]);

  return (
    <div
      ref={ctnDom}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
