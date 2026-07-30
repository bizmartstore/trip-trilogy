import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Compass, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import heroImage from "@/assets/hero.jpg";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(160),
  password: z.string().min(8, "At least 8 characters").max(72),
});

const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(2, "Enter your name").max(80),
  role: z.enum(["tourist", "owner"]),
});

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In or Create an Account | ExploreHub" },
      {
        name: "description",
        content:
          "Sign in to manage your ExploreHub bookings, or create a tourist or business owner account to start listing and booking travel experiences.",
      },
      { property: "og:title", content: "Sign In | ExploreHub" },
      { property: "og:description", content: "Access your ExploreHub trips, bookings and business listings." },
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
    defaultValues: { name: "", email: "", password: "", role: "tourist" },
  });

  const submit = (mode: "in" | "up") => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success(mode === "in" ? "Welcome back" : "Account created", {
        description: "Connect your Supabase project to persist real accounts.",
      });
      navigate({ to: "/dashboard" });
    }, 800);
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
            Join 12,000+ travellers booking tours, stays and tables across 40 countries.
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
            <Compass className="size-6 text-primary" /> ExploreHub
          </span>

          <Tabs defaultValue="signin" className="mt-8">
            <TabsList className="w-full rounded-full">
              <TabsTrigger value="signin" className="flex-1 rounded-full">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1 rounded-full">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-8">
              <h1 className="text-2xl font-semibold">Welcome back</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick up where you left off with your trips.
              </p>
              <Form {...signIn}>
                <form onSubmit={signIn.handleSubmit(() => submit("in"))} className="mt-6 space-y-4">
                  <FormField
                    control={signIn.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" className="h-12 rounded-xl" {...field} />
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
                          <Input type="password" placeholder="••••••••" className="h-12 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" variant="hero" size="lg" className="w-full rounded-full" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="signup" className="mt-8">
              <h1 className="text-2xl font-semibold">Create your account</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Book as a tourist, or list your business on the marketplace.
              </p>
              <Form {...signUp}>
                <form onSubmit={signUp.handleSubmit(() => submit("up"))} className="mt-6 space-y-4">
                  <FormField
                    control={signUp.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl>
                          <Input placeholder="Amara Devi" className="h-12 rounded-xl" {...field} />
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
                          <Input type="email" placeholder="you@example.com" className="h-12 rounded-xl" {...field} />
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
                          <Input type="password" placeholder="At least 8 characters" className="h-12 rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signUp.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>I am a…</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-2xl">
                            <SelectItem value="tourist">Tourist — I want to book</SelectItem>
                            <SelectItem value="owner">Business owner — I want to list</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" variant="hero" size="lg" className="w-full rounded-full" disabled={loading}>
                    {loading ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to the ExploreHub Terms and Privacy Policy.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
