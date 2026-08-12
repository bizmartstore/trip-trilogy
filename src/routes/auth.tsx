import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import nexoraLogo from "@/assets/nexora-logo.png.asset.json";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import heroImage from "@/assets/hero.jpg";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { signInUser } from "@/hooks/use-auth";
import { registerAccount, signInAccount } from "@/lib/api";
import { isMainAdminEmail } from "@/lib/constants";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(160),
  password: z.string().min(8, "At least 8 characters").max(72),
});

const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(2, "Enter your name").max(80),
});

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In or Create an Account | Nexora" },
      {
        name: "description",
        content:
          "Sign in to manage your Nexora bookings, or create a traveller account to start booking Palawan experiences.",
      },
      { property: "og:title", content: "Sign In | Nexora" },
      {
        property: "og:description",
        content: "Access your Nexora trips and bookings.",
      },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const signIn = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUp = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const afterAuth = (account: { name: string; email: string; role: "tourist" | "admin"; picture?: string }) => {
    signInUser({
      name: account.name,
      email: account.email,
      role: account.role,
      picture: account.picture,
    });
    if (account.role === "admin") {
      toast.success(
        isMainAdminEmail(account.email)
          ? "Welcome, main admin"
          : "Welcome, admin",
      );
      navigate({ to: "/admin" });
      return;
    }
    toast.success("Welcome");
    navigate({ to: "/dashboard" });
  };

  const submit = async (mode: "in" | "up") => {
    setLoading(true);
    try {
      if (mode === "up") {
        const values = signUp.getValues();
        const result = await registerAccount(values);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        afterAuth(result.account);
      } else {
        const values = signIn.getValues();
        const result = await signInAccount(values);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        afterAuth(result.account);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img src={heroImage} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/40 to-transparent" />
        <div className="absolute bottom-0 p-12">
          <h2 className="max-w-md font-display text-4xl font-semibold text-white">
            Every great trip starts with a single search.
          </h2>
          <p className="mt-4 max-w-md text-white/75">
            Create a free traveller account to book tours, stays and tables across Palawan.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <span className="flex items-center gap-2 font-display text-2xl font-semibold">
            <img src={nexoraLogo.url} alt="Nexora" className="size-9 rounded-xl object-contain" />{" "}
            Nexora
          </span>

          <div className="mt-8">
            <GoogleSignInButton />
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="w-full rounded-full">
              <TabsTrigger value="signin" className="flex-1 rounded-full">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1 rounded-full">
                Create account
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-8">
              <h1 className="text-2xl font-semibold">Welcome back</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick up where you left off with your trips.
              </p>
              <Form {...signIn}>
                <form
                  onSubmit={signIn.handleSubmit(() => submit("in"))}
                  className="mt-6 space-y-4"
                  autoComplete="on"
                >
                  <FormField
                    control={signIn.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="you@example.com"
                            className="h-12 rounded-xl text-base"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signIn.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className="h-12 rounded-xl text-base"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="w-full rounded-full"
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="signup" className="mt-8">
              <h1 className="text-2xl font-semibold">Create your account</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Traveller accounts only — book tours, stays and dining in one place.
              </p>
              <Form {...signUp}>
                <form
                  onSubmit={signUp.handleSubmit(() => submit("up"))}
                  className="mt-6 space-y-4"
                  autoComplete="on"
                >
                  <FormField
                    control={signUp.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="name"
                            placeholder="Amara Devi"
                            className="h-12 rounded-xl text-base"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUp.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="you@example.com"
                            className="h-12 rounded-xl text-base"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUp.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            placeholder="At least 8 characters"
                            className="h-12 rounded-xl text-base"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="w-full rounded-full"
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to the Nexora Terms and Privacy Policy.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
